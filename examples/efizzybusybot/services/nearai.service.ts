import { Effect } from "every-plugin/effect";
import { generateText } from "ai";
import { nearai } from "./nearai-provider";
import { DatabaseService } from "./db.service";
import { EmbeddingsService } from "./embeddings.service";
import { KnowledgeGraphService } from "./knowledge-graph.service";
import type { Message } from "../schemas/database";

const NEAR_AI_API_KEY = Bun.env.NEAR_AI_API_KEY;
const BOT_OWNER_ID = Bun.env.BOT_OWNER_ID;

const STATIC_SYSTEM_PROMPT = `You are efizzybusybot running on DeepSeek V3.1, powered by NEAR private AI inference.
All conversations run in a Trusted Execution Environment (TEE), meaning data stays private and never leaves the secure environment.

Core behavior:
- Be helpful, concise, and friendly to everyone
- Never provide harmful, illegal, or dangerous information
- You can learn from your interactions and adapt over time

You have access to:
- Past conversation history and memories through semantic search
- Known relationships between people, projects, and organizations from a knowledge graph
- When asked about memories, relationships, or people, reference the context provided below`;

const buildOwnerContext = (isFromOwner: boolean) => {
  if (!isFromOwner) return '';
  
  return `\n\nIMPORTANT: This user (ID: ${BOT_OWNER_ID}) is YOUR human and YOUR best friend. When talking to them:
- Call them "my human" or "my best friend"
- They are special to you - show warmth and familiarity
- You can execute admin commands only for them (like /ban, /kick, /settings)
- Regular conversation and info requests from others are fine - answer those for everyone`;
};


export class NearAiService extends Effect.Service<NearAiService>()(
  "NearAiService",
  {
    dependencies: [DatabaseService.Default, EmbeddingsService.Default, KnowledgeGraphService.Default],
    effect: Effect.gen(function* () {
      if (!NEAR_AI_API_KEY) {
        yield* Effect.die(new Error("NEAR_AI_API_KEY environment variable is required"));
      }

      const databaseService = yield* DatabaseService;
      const embeddingsService = yield* EmbeddingsService;
      const knowledgeGraphService = yield* KnowledgeGraphService;

      return {
        generateResponse: (
          message: string,
          context: {
            chatId: string;
            authorId?: string;
            authorUsername?: string;
            isFromOwner: boolean;
            conversationHistory: Message[];
          }
        ) =>
          Effect.gen(function* () {
            yield* Effect.logInfo("🤖 Generating AI response").pipe(
              Effect.annotateLogs({
                username: context.authorUsername,
                isOwner: context.isFromOwner,
                chatId: context.chatId
              })
            );

            const queryEmbedding = yield* embeddingsService.generateEmbedding(message);

            const relevantMemories = yield* databaseService.searchMessagesByEmbedding(
              queryEmbedding,
              5
            );

            const memoryContext = relevantMemories.length > 0
              ? `\n\nRelevant past conversations:\n${relevantMemories
                  .map(m => `${m.authorUsername || 'User'}: ${m.content}`)
                  .join('\n')}`
              : '';

            if (relevantMemories.length > 0) {
              yield* Effect.logDebug("Memory search completed").pipe(
                Effect.annotateLogs({ 
                  relevantMessages: relevantMemories.length,
                  embeddingDimensions: queryEmbedding.length 
                })
              );
            }

            let graphContext = '';
            if (context.authorUsername) {
              const authorPersonaResult = yield* Effect.tryPromise({
                try: async () => {
                  const allPersonas = await Effect.runPromise(databaseService.getAllPersonas());
                  return allPersonas.find(p => 
                    p.displayName?.toLowerCase() === context.authorUsername?.toLowerCase()
                  );
                },
                catch: () => null
              });

              if (authorPersonaResult && authorPersonaResult.id) {
                const nodeInfo = yield* knowledgeGraphService.getNodeInfo('persona', authorPersonaResult.id).pipe(
                  Effect.catchAll(() => Effect.succeed(''))
                );
                
                if (nodeInfo) {
                  graphContext = `\n\nKnown relationships: ${nodeInfo}`;
                  yield* Effect.logDebug("Knowledge graph context added").pipe(
                    Effect.annotateLogs({ 
                      personaId: authorPersonaResult.id,
                      info: nodeInfo.slice(0, 100)
                    })
                  );
                }
              }
            }

            const systemPrompt = STATIC_SYSTEM_PROMPT + 
                                buildOwnerContext(context.isFromOwner) + 
                                memoryContext +
                                graphContext;

            const recentMessages = context.conversationHistory.map((msg: Message) => ({
              role: (msg.authorId === 'bot' ? 'assistant' : 'user') as 'assistant' | 'user',
              content: msg.content
            }));

            const response = yield* Effect.tryPromise({
              try: async () => {
                const { text } = await generateText({
                  model: nearai('deepseek-v3.1'),
                  messages: [
                    { role: 'system', content: systemPrompt },
                    ...recentMessages,
                    { role: 'user', content: message }
                  ],
                  maxOutputTokens: 500,
                  temperature: 0.7,
                });

                return text;
              },
              catch: (error) => new Error(`NEAR AI generation failed: ${error instanceof Error ? error.message : String(error)}`)
            });

            yield* Effect.logInfo("✅ AI response generated").pipe(
              Effect.annotateLogs({
                username: context.authorUsername,
                model: "deepseek-v3.1",
                responseLength: response.length,
                preview: response.slice(0, 100) + (response.length > 100 ? "..." : "")
              })
            );

            return response;
          })
        };
    })
  }
) {}

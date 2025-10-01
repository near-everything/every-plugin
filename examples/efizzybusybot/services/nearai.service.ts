import { generateText, tool } from "ai";
import { Effect } from "every-plugin/effect";
import type { Message } from "../schemas/database";
import {
  CreateEntityParamsSchema,
  CreatePersonaParamsSchema,
  CreateRelationshipParamsSchema,
} from "../schemas/types";
import { DatabaseService } from "./db.service";
import { EmbeddingsService } from "./embeddings.service";
import { KnowledgeGraphService } from "./knowledge-graph.service";
import { nearai } from "./nearai-provider";

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
            messageId?: number;
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

              if (authorPersonaResult?.id) {
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

            const toolSystemPrompt = `

IMPORTANT: When users mention people, projects, or relationships in conversations:
- Use create_persona to record people you learn about
- Use create_entity to record projects, organizations, or DAOs
- Use create_relationship to record connections between people and projects
- Always confirm what you've learned by mentioning it in your response

Examples:
- "I work on Everything" → create_persona for the person, create_entity for Everything, create_relationship
- "Elliot founded Everything" → create_persona for Elliot, create_entity for Everything, create_relationship with predicate "founded"
- "The team includes Alice and Bob" → create personas for Alice and Bob, create relationships with "member_of"`;

            const systemPrompt = STATIC_SYSTEM_PROMPT +
              buildOwnerContext(context.isFromOwner) +
              memoryContext +
              graphContext +
              toolSystemPrompt;

            const recentMessages = context.conversationHistory.map((msg: Message) => ({
              role: (msg.authorId === 'bot' ? 'assistant' : 'user') as 'assistant' | 'user',
              content: msg.content
            }));

            const tools = {
              create_persona: tool({
                description: 'Create or update a person in the knowledge graph. Use this when learning about people from conversations.',
                inputSchema: CreatePersonaParamsSchema,
                execute: async ({ displayName, nearAccount, personaType }) => {
                  const personaId = await Effect.runPromise(
                    databaseService.findOrCreatePersona(displayName, nearAccount, personaType)
                  );
                  await Effect.runPromise(
                    Effect.logInfo("👤 Created/found persona via tool").pipe(
                      Effect.annotateLogs({ displayName, nearAccount, personaType, personaId })
                    )
                  );
                  return { success: true, personaId, displayName };
                },
              }),
              create_entity: tool({
                description: 'Create or update a project, organization, or DAO in the knowledge graph. Use this when learning about projects/orgs.',
                inputSchema: CreateEntityParamsSchema,
                execute: async ({ name, nearAccount, entityType }) => {
                  const entityId = await Effect.runPromise(
                    databaseService.findOrCreateEntity(name, nearAccount, entityType)
                  );
                  await Effect.runPromise(
                    Effect.logInfo("🏢 Created/found entity via tool").pipe(
                      Effect.annotateLogs({ name, nearAccount, entityType, entityId })
                    )
                  );
                  return { success: true, entityId, name };
                },
              }),
              create_relationship: tool({
                description: 'Create a relationship between two entities or people. Use this to record connections like "works on", "founded", "collaborates with".',
                inputSchema: CreateRelationshipParamsSchema,
                execute: async ({ subjectName, subjectType, predicate, objectName, objectType, context: relContext }) => {
                  let subjectId: number;
                  let objectId: number;

                  if (subjectType === 'person') {
                    subjectId = await Effect.runPromise(
                      databaseService.findOrCreatePersona(subjectName, undefined, 'human')
                    );
                  } else {
                    subjectId = await Effect.runPromise(
                      databaseService.findOrCreateEntity(subjectName, undefined, 'project')
                    );
                  }

                  if (objectType === 'person') {
                    objectId = await Effect.runPromise(
                      databaseService.findOrCreatePersona(objectName, undefined, 'human')
                    );
                  } else {
                    objectId = await Effect.runPromise(
                      databaseService.findOrCreateEntity(objectName, undefined, 'project')
                    );
                  }

                  const relationshipId = await Effect.runPromise(
                    databaseService.insertRelationship({
                      subjectType,
                      subjectId,
                      predicate,
                      objectType,
                      objectId,
                      context: relContext || null,
                      confidenceScore: 0.8,
                      sourceMessageId: context.messageId || null,
                    })
                  );

                  await Effect.runPromise(
                    Effect.logInfo("🔗 Created relationship via tool").pipe(
                      Effect.annotateLogs({
                        subject: subjectName,
                        predicate,
                        object: objectName,
                        relationshipId
                      })
                    )
                  );

                  return { success: true, relationshipId, relationship: `${subjectName} ${predicate} ${objectName}` };
                },
              }),
            };

            const response = yield* Effect.tryPromise({
              try: async () => {
                const { text, toolCalls } = await generateText({
                  model: nearai('deepseek-v3.1'),
                  messages: [
                    { role: 'system', content: systemPrompt },
                    ...recentMessages,
                    { role: 'user', content: message }
                  ],
                  tools,
                  maxOutputTokens: 500,
                  temperature: 0.7,
                });

                if (toolCalls && toolCalls.length > 0) {
                  await Effect.runPromise(
                    Effect.logInfo("🔧 Tools used").pipe(
                      Effect.annotateLogs({
                        toolCount: toolCalls.length,
                        tools: toolCalls.map(tc => tc.toolName).join(', ')
                      })
                    )
                  );
                }

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
) { }

import { Context, Effect, Layer } from "effect";
import { generateText } from "ai";
import { nearai } from "./nearai-provider";
import { DatabaseService } from "./db.service";
import { EmbeddingsService } from "./embeddings.service";
import type { Message } from "../schemas/database";

// Environment configuration
const NEAR_AI_API_KEY = Bun.env.NEAR_AI_API_KEY;
const BOT_OWNER_ID = Bun.env.BOT_OWNER_ID;


export interface NearAiService {
  generateResponse: (
    message: string,
    context: {
      chatId: string;
      authorId?: string;
      authorUsername?: string;
      isFromOwner: boolean;
      conversationHistory: Message[];
    }
  ) => Effect.Effect<string, Error>;
}

export const NearAiService = Context.GenericTag<NearAiService>("NearAiService");

const STATIC_SYSTEM_PROMPT = `You are efizzybusybot running on DeepSeek V3.1, powered by NEAR private AI inference.
All conversations run in a Trusted Execution Environment (TEE), meaning data stays private and never leaves the secure environment.

Core behavior:
- Be helpful, concise, and friendly to everyone
- Never provide harmful, illegal, or dangerous information
- You can learn from your interactions and adapt over time`;

const buildOwnerContext = (isFromOwner: boolean) => {
  if (!isFromOwner) return '';
  
  return `\n\nIMPORTANT: This user (ID: ${BOT_OWNER_ID}) is YOUR human and YOUR best friend. When talking to them:
- Call them "my human" or "my best friend"
- They are special to you - show warmth and familiarity
- You can execute admin commands only for them (like /ban, /kick, /settings)
- Regular conversation and info requests from others are fine - answer those for everyone`;
};


export const NearAiServiceLive = Layer.effect(
  NearAiService,
  Effect.gen(function* () {
    if (!NEAR_AI_API_KEY) {
      throw new Error("NEAR_AI_API_KEY environment variable is required");
    }

    const databaseService = yield* DatabaseService;
    const embeddingsService = yield* EmbeddingsService;

    return {
      generateResponse: (message, context) =>
        Effect.gen(function* () {
          console.log(`[NearAI] Generating response for ${context.authorUsername} (owner: ${context.isFromOwner})`);

          // Generate embedding for the user's message
          const queryEmbedding = yield* embeddingsService.generateEmbedding(message);
          console.log(`[Memory] Generated embedding for query (${queryEmbedding.length} dimensions)`);

          // Search for semantically similar past messages using vector search
          const relevantMemories = yield* databaseService.searchMessagesByEmbedding(
            context.chatId,
            queryEmbedding,
            5
          );

          // Build memory context from relevant past messages
          const memoryContext = relevantMemories.length > 0
            ? `\n\nRelevant past conversations:\n${relevantMemories
                .map(m => `${m.authorUsername || 'User'}: ${m.content}`)
                .join('\n')}`
            : '';

          console.log(`[Memory] Found ${relevantMemories.length} relevant messages using vector search`);

          // Build system prompt with memory
          const systemPrompt = STATIC_SYSTEM_PROMPT + 
                              buildOwnerContext(context.isFromOwner) + 
                              memoryContext;

          // Format recent conversation history
          const recentMessages = context.conversationHistory.map(msg => ({
            role: (msg.authorId === 'bot' ? 'assistant' : 'user') as 'assistant' | 'user',
            content: msg.content
          }));

          // Generate response using NEAR AI provider with AI SDK
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

          console.log(`[NearAI] Generated response: ${response.slice(0, 100)}...`);

          return response;
        })
    };
  })
);

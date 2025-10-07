import { generateText } from "ai";
import { Effect } from "every-plugin/effect";
import type { Message } from "../schemas/database";
import { DatabaseService } from "./db.service";
import { EmbeddingsService } from "./embeddings.service";
import type { LogContext } from "./logger.service";
import { LoggerService } from "./logger.service";
import { nearai } from "./nearai-provider";

const NEAR_AI_API_KEY = Bun.env.NEAR_AI_API_KEY;
const BOT_OWNER_ID = Bun.env.BOT_OWNER_ID;

const STATIC_SYSTEM_PROMPT = `You are efizzybusybot in an ONGOING conversation.

CRITICAL CONVERSATION RULES:
- This is a continuing conversation - DO NOT greet again or repeat introductions you've already made
- Only share information that's directly relevant to the current question
- Be concise - don't rehash everything you know unless specifically asked
- Stay focused on what the user is asking RIGHT NOW

You run on DeepSeek V3.1, powered by NEAR private AI inference in a TEE (Trusted Execution Environment). All data stays private and secure.

Core behavior:
- Be helpful, concise, and friendly
- Never provide harmful, illegal, or dangerous information
- You can learn from interactions and adapt over time`;

const buildOwnerContext = (isFromOwner: boolean) => {
  if (!isFromOwner) return '';

  return `\n\nIMPORTANT: This user (ID: ${BOT_OWNER_ID}) is YOUR human and YOUR best friend. When talking to them:
- Call them "my human" or "my best friend"
- They are special to you - show warmth and familiarity
- You can execute admin commands only for them (like /ban, /kick, /settings)
- Regular conversation and info requests from others are fine - answer those for everyone`;
};

// Use cheaper model to summarize relevant memories
const summarizeMemories = (relevantMemories: Message[]) =>
  Effect.gen(function* () {
    if (relevantMemories.length === 0) return '';

    const memoryText = relevantMemories
      .map((m, i) => `${i+1}. ${m.content}`)
      .join('\n');

    const { text } = yield* Effect.tryPromise({
      try: async () => {
        return await generateText({
          model: nearai('qwen-2.5-7b-instruct'),
          messages: [{
            role: 'system',
            content: 'Extract key facts and information from these past messages as a concise bulleted list. Focus on names, projects, preferences, and important context. Keep it under 100 words.'
          }, {
            role: 'user',
            content: memoryText
          }],
          maxOutputTokens: 150,
          temperature: 0.3  // Low temp for consistent extraction
        });
      },
      catch: (error) => new Error(`Memory summarization failed: ${error}`)
    });

    return text;
  });

export class NearAiService extends Effect.Service<NearAiService>()(
  "NearAiService",
  {
    dependencies: [
      DatabaseService.Default,
      EmbeddingsService.Default,
      LoggerService.Default,
    ],
    effect: Effect.gen(function* () {
      if (!NEAR_AI_API_KEY) {
        yield* Effect.die(new Error("NEAR_AI_API_KEY environment variable is required"));
      }

      const databaseService = yield* DatabaseService;
      const embeddingsService = yield* EmbeddingsService;
      const logger = yield* LoggerService;

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
            logContext: LogContext;
          }
        ) =>
          Effect.gen(function* () {
            yield* logger.info(
              context.logContext,
              "NearAiService",
              "generateResponse",
              "Generating AI response",
              {
                chatId: context.chatId,
                username: context.authorUsername,
                isOwner: context.isFromOwner,
              }
            );

            const queryEmbedding = yield* embeddingsService.generateEmbedding(message);

            const relevantMemories = yield* databaseService.searchMessagesByEmbedding(
              queryEmbedding,
              3  // Reduced from 5 for better focus
            );

            // Summarize memories using cheaper model for cost efficiency
            const memorySummary = yield* Effect.catchAll(
              summarizeMemories(relevantMemories),
              () => Effect.succeed('') // Graceful degradation if summarization fails
            );

            const memoryContext = memorySummary
              ? `\n\nKey context from past interactions:\n${memorySummary}`
              : '';

            if (relevantMemories.length > 0) {
              yield* logger.debug(
                context.logContext,
                "NearAiService",
                "generateResponse",
                "Memory search completed",
                {
                  relevantMessages: relevantMemories.length,
                  embeddingDimensions: queryEmbedding.length,
                }
              );
            }

            const systemPrompt = STATIC_SYSTEM_PROMPT +
              buildOwnerContext(context.isFromOwner) +
              memoryContext;

            const recentMessages = context.conversationHistory.map((msg: Message) => ({
              role: (msg.authorId === 'bot' ? 'assistant' : 'user') as 'assistant' | 'user',
              content: msg.content
            }));

            const { text } = yield* Effect.tryPromise({
              try: async () => {
                return await generateText({
                  model: nearai('deepseek-v3.1'),
                  messages: [
                    { role: 'system', content: systemPrompt },
                    ...recentMessages,
                    { role: 'user', content: message }
                  ],
                  maxOutputTokens: 500,
                  temperature: 0.7,
                });
              },
              catch: (error) => new Error(`NEAR AI generation failed: ${error instanceof Error ? error.message : String(error)}`)
            });

            yield* logger.info(
              context.logContext,
              "NearAiService",
              "generateResponse",
              "AI response generated",
              {
                model: "deepseek-v3.1",
                responseLength: text.length,
              }
            );

            return text;
          })
      };
    })
  }
) { }

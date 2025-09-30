import { createPlugin } from "every-plugin";
import { Effect, Queue, Stream } from "every-plugin/effect";
import { implement } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import type { Context } from "telegraf";
import { Telegraf } from "telegraf";
import type { Update } from "telegraf/types";
import {
  telegramContract,
} from "./schemas";

const MAX_QUEUE_SIZE = 1000;

const handleTelegramError = (error: unknown, errors: Record<string, Function>): never => {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('unauthorized') || message.includes('401')) {
      throw errors.UNAUTHORIZED({
        message: 'Invalid bot token',
        data: { provider: 'telegram', botTokenProvided: true }
      });
    }

    if (message.includes('forbidden') || message.includes('403')) {
      throw errors.FORBIDDEN({
        message: 'Bot lacks necessary permissions',
        data: { provider: 'telegram' }
      });
    }

    if (message.includes('bad request') || message.includes('400')) {
      throw errors.BAD_REQUEST({
        message: 'Invalid request parameters',
        data: { provider: 'telegram' }
      });
    }

    if (message.includes('not found') || message.includes('404')) {
      throw errors.NOT_FOUND({
        message: 'Chat or resource not found',
        data: { provider: 'telegram' }
      });
    }

    if (message.includes('too many requests') || message.includes('429')) {
      throw errors.SERVICE_UNAVAILABLE({
        message: 'Rate limited by Telegram API',
        data: { provider: 'telegram', retryAfter: 30 }
      });
    }
  }

  throw errors.SERVICE_UNAVAILABLE({
    message: error instanceof Error ? error.message : 'Unknown Telegram API error',
    data: { provider: 'telegram' }
  });
};

export default createPlugin({
  id: "@curatedotfun/telegram-source",
  type: "source",
  variables: z.object({
    domain: z.string().min(1).optional(), // Optional - if not provided, use polling mode
    timeout: z.number().default(30000),
    defaultMaxResults: z.number().min(1).max(1000).default(100),
  }),
  secrets: z.object({
    webhookToken: z.string().optional(),
    botToken: z.string().min(1, "Telegram bot token is required"),
  }),
  contract: telegramContract,

  initialize: (config) =>
    Effect.gen(function* () {
      const { variables, secrets } = config;
      const isWebhookMode = !!variables.domain;

      // Create shared queue as a scoped resource
      const queue = yield* Effect.acquireRelease(
        Queue.bounded<Context<Update>>(MAX_QUEUE_SIZE),
        (q) => Queue.shutdown(q)
      );

      const bot = new Telegraf(secrets.botToken);

      // Validate bot token using Effect
      yield* Effect.tryPromise({
        try: () => bot.telegram.getMe(),
        catch: (error) => new Error(`Bot token validation failed: ${error instanceof Error ? error.message : String(error)}`)
      });

      if (isWebhookMode) {
        // Webhook mode: No middleware needed, updates come via webhook handler
        const webhookUrl = `${variables.domain}/telegram/webhook`;
        yield* Effect.tryPromise({
          try: () => bot.telegram.setWebhook(webhookUrl, {
            secret_token: secrets.webhookToken,
          }),
          catch: (error) => new Error(`Webhook registration failed: ${error instanceof Error ? error.message : String(error)}`)
        });
        yield* Effect.sync(() => console.log(`[Telegram] Webhook registered: ${webhookUrl}`));

        return {
          bot,
          queue,
          isWebhookMode
        };
      } else {
        // Polling mode: Clear any existing webhook first to ensure polling works
        yield* Effect.tryPromise({
          try: () => bot.telegram.deleteWebhook({ drop_pending_updates: false }),
          catch: () => new Error("Failed to clear webhook (may not exist)")
        }).pipe(
          Effect.catchAll(() => Effect.void) // Ignore errors if no webhook exists
        );
        yield* Effect.sync(() => console.log("[Telegram] Webhook cleared for polling"));

        // Set up middleware to capture all updates and enqueue them
        bot.use((ctx, next) => {
          const updateType = ctx.updateType;
          const chatId = ctx.chat?.id;
          const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
          const fromUser = ctx.from?.username || ctx.from?.first_name || 'unknown';

          console.log(`📥 [Telegram] Update ${ctx.update.update_id}: ${updateType} from ${fromUser} in chat ${chatId}${messageText ? ` - "${messageText}"` : ''}`);

          // Enqueue context using Effect.runFork to avoid blocking Telegraf's event loop
          Effect.runFork(
            Queue.offer(queue, ctx).pipe(
              Effect.tap(() => Effect.sync(() => console.log(`📋 [Queue] Added context to queue`))),
              Effect.tap(() => Queue.size(queue).pipe(
                Effect.tap((size) => Effect.sync(() => console.log(`📋 [Queue] Current queue size: ${size}`)))
              )),
              Effect.catchAll(() => Effect.void) // ignore enqueue failures
            )
          );

          return next();
        });

        // Add error handler for Telegraf
        bot.catch((err) => {
          console.error("[Telegram] Bot error:", err);
        });

        // Launch Telegraf polling in a scoped fiber so it's managed by the plugin scope
        const pollingFiber = yield* Effect.forkScoped(
          Effect.tryPromise({
            try: () => bot.launch({
              dropPendingUpdates: false,
              allowedUpdates: ["message", "edited_message", "channel_post", "edited_channel_post"]
            }),
            catch: (error) => new Error(`Bot launch failed: ${error instanceof Error ? error.message : String(error)}`)
          })
        );
        yield* Effect.sync(() => console.log("[Telegram] Polling started"));

        return {
          bot,
          queue,
          isWebhookMode,
          pollingFiber
        };
      }
    }),

  shutdown: (context) =>
    Effect.gen(function* () {
      if (!context.isWebhookMode) {
        yield* Effect.try({
          try: () => context.bot.stop(),
          catch: (error) => new Error(`Failed to stop polling: ${error instanceof Error ? error.message : String(error)}`)
        });
        yield* Effect.sync(() => console.log("[Telegram] Polling stopped"));
      } else {
        // For webhook mode, remove the webhook
        yield* Effect.tryPromise({
          try: () => context.bot.telegram.deleteWebhook(),
          catch: (error) => new Error(`Failed to remove webhook: ${error instanceof Error ? error.message : String(error)}`)
        }).pipe(Effect.catchAll(() => Effect.void));
        yield* Effect.sync(() => console.log("[Telegram] Webhook removed"));
      }
    }),

  createRouter: (context) => {
    const os = implement(telegramContract);

    const webhook = os.webhook.handler(({ input }) =>
      Effect.runPromise(
        Effect.gen(function* () {
          // In webhook mode, manually process the update and add to queue
          yield* Effect.tryPromise({
            try: async () => {
              // Process the update through the bot to create a Context
              await context.bot.handleUpdate(input);
            },
            catch: (error) => new Error(`Webhook processing failed: ${error instanceof Error ? error.message : String(error)}`)
          }).pipe(
            Effect.catchAll((error) => 
              Effect.sync(() => {
                // Log the error but don't fail - malformed data should be handled gracefully
                console.error(`[Telegram] Webhook processing error: ${error.message}`);
              })
            )
          );
          return { processed: true };
        })
      )
    );

    const listen = os.listen.handler(async function* ({ input, errors }) {
      const { maxResults, chatId, messageTypes, chatTypes, commands } = input;

      console.log(`🎧 [Listen] Starting listen maxResults: ${maxResults}`);

      // Create a blocking, infinite stream that only ends when the plugin scope closes
      let stream = Stream.repeatEffect(Queue.take(context.queue));

      console.log(`📡 [Listen] Created stream from queue`);

      // Apply chatId filter
      if (chatId) {
        stream = stream.pipe(
          Stream.filter((ctx: Context<Update>) => {
            const id = ctx.chat?.id;
            return typeof id === "number" || typeof id === "bigint"
              ? String(id) === chatId
              : false;
          })
        );
      }

      // Apply chatTypes filter
      if (chatTypes && chatTypes.length > 0) {
        stream = stream.pipe(
          Stream.filter((ctx: Context<Update>) =>
            ctx.chat?.type ? chatTypes.includes(ctx.chat.type) : false
          )
        );
      }

      // Apply messageTypes filter
      if (messageTypes && messageTypes.length > 0) {
        stream = stream.pipe(
          Stream.filter((ctx: Context<Update>) => {
            return messageTypes.some(type => {
              switch (type) {
                case 'text': {
                  const isTextMessage = ctx.message && 'text' in ctx.message;
                  if (!isTextMessage) return false;

                  const messageText = ctx.message.text || '';
                  const isCommand = messageText.startsWith('/');

                  // If commands are specified, allow commands through text filter
                  if (isCommand && commands && commands.length > 0) {
                    return true;
                  }

                  // Otherwise, only allow non-command text messages
                  return !isCommand;
                }
                case 'photo': return ctx.message && 'photo' in ctx.message;
                case 'document': return ctx.message && 'document' in ctx.message;
                case 'video': return ctx.message && 'video' in ctx.message;
                case 'voice': return ctx.message && 'voice' in ctx.message;
                case 'audio': return ctx.message && 'audio' in ctx.message;
                case 'sticker': return ctx.message && 'sticker' in ctx.message;
                case 'location': return ctx.message && 'location' in ctx.message;
                case 'contact': return ctx.message && 'contact' in ctx.message;
                case 'animation': return ctx.message && 'animation' in ctx.message;
                case 'video_note': return ctx.message && 'video_note' in ctx.message;
                default: return false;
              }
            });
          })
        );
      }

      // Apply commands filter
      if (commands && commands.length > 0) {
        stream = stream.pipe(
          Stream.filter((ctx: Context<Update>) => {
            const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
            return !!messageText && commands.some(cmd => messageText.startsWith(cmd));
          })
        );
      }

      // Apply limits (only when specified)
      if (maxResults) {
        stream = stream.pipe(Stream.take(maxResults));
      }

      // Final debugging before yielding
      stream = stream.pipe(
        Stream.tap((ctx: Context<Update>) => Effect.sync(() =>
          console.log(`🔄 [Stream] Yielding context for chat ${ctx.chat?.id}, update ${ctx.update.update_id}`)
        ))
      );

      yield* Stream.toAsyncIterable(stream);
    });

    const sendMessage = os.sendMessage.handler(({ input, errors }) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.tryPromise({
            try: () => context.bot.telegram.sendMessage(
              input.chatId,
              input.text,
              {
                reply_parameters: input.replyToMessageId ? { message_id: input.replyToMessageId } : undefined,
                parse_mode: input.parseMode,
              }
            ),
            catch: (error) => handleTelegramError(error, errors)
          });

          return {
            messageId: result.message_id,
            success: true,
            chatId: input.chatId,
          };
        })
      )
    );

    return os.router({
      webhook,
      listen,
      sendMessage,
    });
  }
});

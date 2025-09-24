import { implement } from "@orpc/server";
import { Effect, Fiber } from "effect";
import { PluginConfigurationError, PluginLoggerTag, SimplePlugin } from "every-plugin";
import { Telegraf } from "telegraf";
import type { Update } from "telegraf/types";
import {
  type SourceItem,
  stateSchema,
  type StreamState,
  telegramContract,
  type TelegramSourceConfig,
  TelegramSourceConfigSchema
} from "./schemas";

const MAX_QUEUE_SIZE = 1000;

const handleTelegramError = (error: unknown, errors: any): never => {
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

// Extract message from any update type
function getMessageFromUpdate(update: Update) {
  return ('message' in update && update.message) ||
         ('edited_message' in update && update.edited_message) ||
         ('channel_post' in update && update.channel_post) ||
         ('edited_channel_post' in update && update.edited_channel_post) ||
         null;
}

// Simple filtering helper functions for raw Telegram updates
function updateMatchesChat(update: Update, chatId: string): boolean {
  const message = getMessageFromUpdate(update);
  return message ? message.chat.id.toString() === chatId : false;
}

function updateHasText(update: Update): boolean {
  const message = getMessageFromUpdate(update);
  return message ? (('text' in message && !!message.text) || ('caption' in message && !!message.caption)) : false;
}

function updateIsCommand(update: Update): boolean {
  const message = getMessageFromUpdate(update);
  return message && 'text' in message && message.text ? message.text.startsWith('/') : false;
}

function isMessageUpdate(update: Update): boolean {
  return !!getMessageFromUpdate(update);
}

function detectMediaType(message: any): 'text' | 'image' | 'video' | 'audio' | 'file' | 'sticker' {
  if (message.photo) return 'image';
  if (message.video || message.video_note) return 'video';
  if (message.audio || message.voice) return 'audio';
  if (message.sticker) return 'sticker';
  if (message.document) return 'file';
  return 'text';
}

function hasMediaContent(message: any): boolean {
  return !!(message.photo || message.video || message.video_note || 
           message.audio || message.voice || message.sticker || 
           message.document);
}

function generateTelegramUrl(message: any): string | undefined {
  if (message.chat.type === 'private') return undefined;
  
  if ('username' in message.chat && message.chat.username) {
    return `https://t.me/${message.chat.username}/${message.message_id}`;
  }
  
  return `https://t.me/c/${Math.abs(message.chat.id)}/${message.message_id}`;
}

function convertUpdateToSourceItem(update: Update): SourceItem | null {
  const message = getMessageFromUpdate(update);
  if (!message) return null;

  // Extract content
  let content = '';
  let contentType: 'text' | 'image' | 'video' | 'audio' | 'file' | 'sticker' = 'text';
  
  if ('text' in message && message.text) {
    content = message.text;
    contentType = 'text';
  } else if ('caption' in message && message.caption) {
    content = message.caption;
    contentType = detectMediaType(message);
  } else if (hasMediaContent(message)) {
    content = '[Media message]';
    contentType = detectMediaType(message);
  } else {
    content = '[System message]';
    contentType = 'text';
  }

  return {
    // Clean fields
    id: `${message.chat.id}-${message.message_id}`,
    content,
    contentType,
    createdAt: new Date(message.date * 1000).toISOString(),
    url: generateTelegramUrl(message),
    
    // Author
    author: message.from ? {
      id: message.from.id.toString(),
      username: message.from.username,
      displayName: `${message.from.first_name}${message.from.last_name ? ` ${message.from.last_name}` : ''}`,
    } : undefined,
    
    // Telegram conveniences
    chatId: message.chat.id.toString(),
    messageId: message.message_id,
    isCommand: content.startsWith('/'),
    isReply: !!(message as any).reply_to_message,
    hasMedia: hasMediaContent(message),
    chatType: message.chat.type,
    
    // Full access
    raw: update,
    message,
  };
}

export class TelegramSourcePlugin extends SimplePlugin<
  typeof telegramContract,
  typeof TelegramSourceConfigSchema,
  typeof stateSchema
> {
  readonly id = "@curatedotfun/telegram-source" as const;
  readonly type = "source" as const;
  readonly contract = telegramContract;
  readonly configSchema = TelegramSourceConfigSchema;
  readonly stateSchema = stateSchema;

  static readonly contract = telegramContract;

  private bot: Telegraf | null = null;
  private updateQueue: Update[] = [];
  private botFiber: Fiber.RuntimeFiber<void, PluginConfigurationError> | null = null;
  private isWebhookMode = false;

  private addToQueue(update: Update) {
    if (this.updateQueue.length >= MAX_QUEUE_SIZE) {
      this.updateQueue.shift();
    }
    this.updateQueue.push(update);
  }

  initialize(config?: TelegramSourceConfig): Effect.Effect<void, PluginConfigurationError, PluginLoggerTag> {
    const self = this;
    return Effect.gen(function* () {
      const logger = yield* PluginLoggerTag;

      if (!config?.secrets?.botToken) {
        return yield* Effect.fail(new PluginConfigurationError({
          message: "Telegram bot token is required",
          retryable: false
        }));
      }

      // Determine mode based on domain presence
      self.isWebhookMode = !!config?.variables?.domain;

      self.bot = new Telegraf(config.secrets.botToken);

      // Validate bot token
      yield* Effect.tryPromise({
        try: () => self.bot!.telegram.getMe(),
        catch: (error) => new PluginConfigurationError({
          message: `Bot token validation failed: ${error instanceof Error ? error.message : String(error)}`,
          retryable: false,
          cause: error instanceof Error ? error : new Error(String(error))
        })
      });

      // Set up middleware to capture all updates
      self.bot.use(async (ctx, next) => {
        self.addToQueue(ctx.update);
        await next();
      });

      if (self.isWebhookMode) {
        // Webhook mode setup
        const webhookUrl = `${config.variables!.domain}/telegram/webhook`;
        yield* Effect.tryPromise({
          try: () => self.bot!.telegram.setWebhook(webhookUrl, {
            secret_token: config.secrets?.webhookToken,
          }),
          catch: (error) => new PluginConfigurationError({
            message: `Webhook registration failed: ${error instanceof Error ? error.message : String(error)}`,
            retryable: true,
            cause: error instanceof Error ? error : new Error(String(error))
          })
        });

        yield* logger.logDebug("Telegram webhook registered", {
          pluginId: self.id,
          webhookUrl,
          mode: 'webhook'
        });
      } else {
        // Polling mode setup
        const botEffect = Effect.gen(function* () {
          yield* Effect.tryPromise({
            try: () => self.bot!.launch({ 
              dropPendingUpdates: false,
              allowedUpdates: ["message", "edited_message", "channel_post", "edited_channel_post"]
            }),
            catch: (error) => new PluginConfigurationError({
              message: `Bot launch failed: ${error instanceof Error ? error.message : String(error)}`,
              retryable: true,
              cause: error instanceof Error ? error : new Error(String(error))
            })
          });

          // Keep the bot alive until interrupted
          yield* Effect.never;
        });

        // Start bot as supervised background fiber
        self.botFiber = yield* Effect.fork(
          botEffect.pipe(
            Effect.catchAll((error) => {
              return logger.logError("Bot fiber crashed", error, { pluginId: self.id });
            })
          )
        );

        yield* logger.logDebug("Telegram polling started", {
          pluginId: self.id,
          mode: 'polling'
        });
      }
    });
  }

  createRouter() {
    const os = implement(telegramContract).$context<{ state: StreamState | null }>();

    const webhook = os.webhook.handler(async ({ input }) => {
      if (!this.bot) throw new Error("Plugin not initialized");

      // Add the update directly to queue
      this.addToQueue(input as Update);

      return { processed: true };
    });

    const listen = os.listen.handler(async ({ input, context, errors }) => {
      if (!this.bot) throw new Error("Plugin not initialized");

      try {
        const currentState = context?.state;
        const availableUpdates = this.updateQueue.splice(0, input.maxResults || 100);

        const filteredUpdates: Update[] = [];

        for (const update of availableUpdates) {
          // Skip non-message updates
          if (!isMessageUpdate(update)) {
            continue;
          }

          // Filter by chat ID
          if (input.chatId && !updateMatchesChat(update, input.chatId)) {
            continue;
          }

          // Filter text-only messages
          if (input.textOnly && !updateHasText(update)) {
            continue;
          }

          // Filter commands
          if (!input.includeCommands && updateIsCommand(update)) {
            continue;
          }

          filteredUpdates.push(update);
        }

        // Convert filtered updates to SourceItems
        const sourceItems = filteredUpdates
          .map(convertUpdateToSourceItem)
          .filter((item): item is SourceItem => item !== null);

        const nextPollMs = sourceItems.length > 0 ? 100 : 2000;

        const nextState: StreamState = {
          totalProcessed: (currentState?.totalProcessed || 0) + sourceItems.length,
          lastUpdateId: availableUpdates.length > 0 ? availableUpdates[availableUpdates.length - 1].update_id : currentState?.lastUpdateId,
          nextPollMs,
          chatId: input.chatId || currentState?.chatId,
        };

        return {
          items: sourceItems,
          nextState
        };

      } catch (error) {
        return handleTelegramError(error, errors);
      }
    });

    const sendMessage = os.sendMessage.handler(async ({ input, errors }) => {
      if (!this.bot) throw new Error("Plugin not initialized");

      try {
        const result = await this.bot.telegram.sendMessage(
          input.chatId,
          input.text,
          {
            reply_parameters: input.replyToMessageId ? { message_id: input.replyToMessageId } : undefined,
            parse_mode: input.parseMode,
          }
        );

        return {
          messageId: result.message_id,
          success: true,
          chatId: input.chatId,
        };
      } catch (error) {
        return handleTelegramError(error, errors);
      }
    });

    return os.router({
      webhook,
      listen,
      sendMessage,
    });
  }

  shutdown(): Effect.Effect<void, never, PluginLoggerTag> {
    const self = this;
    return Effect.gen(function* () {
      const logger = yield* PluginLoggerTag;

      if (self.botFiber) {
        yield* Fiber.interrupt(self.botFiber).pipe(
          Effect.catchAll((error: any) => {
            return logger.logWarning("Failed to interrupt bot fiber cleanly", {
              pluginId: self.id,
              error: error instanceof Error ? error.message : String(error)
            });
          })
        );
        self.botFiber = null;
      }

      if (self.bot) {
        self.bot.stop('SIGTERM');
        self.bot = null;
      }

      self.updateQueue = [];

      yield* logger.logDebug("Telegram source plugin shutdown completed", {
        pluginId: self.id
      });
    });
  }
}

export default TelegramSourcePlugin;

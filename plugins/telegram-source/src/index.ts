import { implement } from "@orpc/server";
import { Duration, Effect, Fiber, Scope } from "effect";
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

// Constants
const POLLING_LIMIT = 100;

// State transitions adapted for Telegram's real-time nature
const StateTransitions = {
  fromInitial: (items: SourceItem[]): 'collecting' | 'monitoring' =>
    items.length > 0 ? 'collecting' : 'monitoring',

  fromCollecting: (items: SourceItem[], hasReachedLimit: boolean): 'collecting' | 'monitoring' =>
    items.length < POLLING_LIMIT || hasReachedLimit ? 'monitoring' : 'collecting',

  fromMonitoring: (): 'monitoring' => 'monitoring'
};

// Helper to convert Telegram API errors to oRPC errors
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

  // Default to service unavailable
  throw errors.SERVICE_UNAVAILABLE({
    message: error instanceof Error ? error.message : 'Unknown Telegram API error',
    data: { provider: 'telegram' }
  });
};

// Helper function to detect bot mentions
function detectBotMention(message: any, botInfo: any): boolean {
  if (!message || !botInfo) return false;

  // Check if replying to bot's message
  if (message.reply_to_message?.from?.id === botInfo.id) {
    return true;
  }

  // Check for @botusername mentions in text
  if (message.text?.includes(`@${botInfo.username}`)) {
    return true;
  }

  // Check entities for mentions
  if (message.entities) {
    return message.entities.some((entity: any) =>
      entity.type === 'mention' &&
      message.text.substring(entity.offset, entity.offset + entity.length) === `@${botInfo.username}`
    );
  }

  return false;
}

// Helper function to convert Telegram updates to plugin format
function convertTelegramUpdateToSourceItem(update: Update, botInfo?: any): SourceItem | null {
  // Only process message updates for now
  if (!('message' in update) || !update.message) {
    return null;
  }

  const message = update.message;

  // Extract text content - handle different message types properly
  let content = '[Non-text message]';
  if ('text' in message && message.text) {
    content = message.text;
  } else if ('caption' in message && message.caption) {
    content = message.caption;
  }

  // Detect bot mentions
  const isMentioned = botInfo ? detectBotMention(message, botInfo) : false;

  // Generate Telegram URL (works for public groups/channels)
  const generateTelegramUrl = (chatId: number, messageId: number): string | undefined => {
    // For private chats, we can't generate a meaningful URL
    if (message.chat.type === 'private') {
      return undefined;
    }

    // For groups/channels, try to construct URL
    if ('username' in message.chat && message.chat.username) {
      return `https://t.me/${message.chat.username}/${messageId}`;
    }

    // For groups without username, use the chat ID format (may not always work)
    return `https://t.me/c/${Math.abs(chatId)}/${messageId}`;
  };

  return {
    externalId: `${message.chat.id}-${message.message_id}`,
    content,
    contentType: "message",
    createdAt: new Date(message.date * 1000).toISOString(),
    url: generateTelegramUrl(message.chat.id, message.message_id),
    authors: message.from ? [{
      id: message.from.id.toString(),
      username: message.from.username,
      displayName: `${message.from.first_name}${message.from.last_name ? ` ${message.from.last_name}` : ''}`,
    }] : undefined,
    isMentioned, // NEW: Bot mention detection
    raw: update,
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
  private isWebhookMode = false;
  private updateQueue: Update[] = [];
  private botInfo: any = null;
  private botFiber: Fiber.Fiber<void, Error> | null = null;

  initialize(config?: TelegramSourceConfig): Effect.Effect<void, PluginConfigurationError, PluginLoggerTag> {
    const self = this;
    return Effect.gen(function* () {
      console.log("[DEBUG] TelegramSourcePlugin.initialize() - START");
      const logger = yield* PluginLoggerTag;

      if (!config?.secrets?.botToken) {
        console.log("[DEBUG] TelegramSourcePlugin.initialize() - FAIL: No bot token");
        return yield* Effect.fail(new PluginConfigurationError({
          message: "Telegram bot token is required",
          retryable: false
        }));
      }

      console.log("[DEBUG] TelegramSourcePlugin.initialize() - Creating Telegraf bot");
      // Initialize Telegraf bot
      self.bot = new Telegraf(config.secrets.botToken);
      self.isWebhookMode = !!config.variables?.baseUrl;
      console.log(`[DEBUG] TelegramSourcePlugin.initialize() - Bot created, webhook mode: ${self.isWebhookMode}`);

      console.log("[DEBUG] TelegramSourcePlugin.initialize() - Getting bot info");
      // Get bot info for mention detection
      self.botInfo = yield* Effect.tryPromise({
        try: () => self.bot!.telegram.getMe(),
        catch: (error) => new PluginConfigurationError({
          message: `Bot token validation failed: ${error instanceof Error ? error.message : String(error)}`,
          retryable: false,
          cause: error instanceof Error ? error : new Error(String(error))
        })
      });
      console.log(`[DEBUG] TelegramSourcePlugin.initialize() - Bot info retrieved: @${self.botInfo.username}`);

      console.log("[DEBUG] TelegramSourcePlugin.initialize() - Setting up middleware");
      // Set up middleware to capture all updates
      self.bot.use(async (ctx, next) => {
        console.log(`[DEBUG] Bot middleware triggered - Update ID: ${ctx.update.update_id}, Queue size before: ${self.updateQueue.length}`);
        // Add update to our queue for streaming
        self.updateQueue.push(ctx.update);
        console.log(`[DEBUG] Bot middleware - Update added to queue, Queue size after: ${self.updateQueue.length}`);
        await next();
        console.log(`[DEBUG] Bot middleware - Processing complete for update ${ctx.update.update_id}`);
      });
      console.log("[DEBUG] TelegramSourcePlugin.initialize() - Middleware registered");

      console.log("[DEBUG] TelegramSourcePlugin.initialize() - Starting bot as supervised fiber");

      // Create bot management effect that runs until interrupted
      const botEffect = Effect.gen(function* () {
        console.log("[DEBUG] TelegramSourcePlugin.initialize() - Starting bot management");

        if (self.isWebhookMode) {
          console.log("[DEBUG] TelegramSourcePlugin.initialize() - Starting webhook mode");
          const webhookUrl = `${config.variables!.baseUrl}${config.variables?.webhookPath || '/telegram-webhook'}`;

          yield* Effect.tryPromise({
            try: () => self.bot!.launch({
              webhook: {
                domain: new URL(webhookUrl).hostname,
                port: parseInt(new URL(webhookUrl).port) || 443,
                path: new URL(webhookUrl).pathname,
              }
            }),
            catch: (error) => new PluginConfigurationError({
              message: `Webhook launch failed: ${error instanceof Error ? error.message : String(error)}`,
              retryable: true,
              cause: error instanceof Error ? error : new Error(String(error))
            })
          });
          console.log(`[DEBUG] TelegramSourcePlugin.initialize() - Webhook launched successfully: ${webhookUrl}`);

          yield* logger.logDebug("Telegram webhook launched", {
            pluginId: self.id,
            webhookUrl
          });
        } else {
          console.log("[DEBUG] TelegramSourcePlugin.initialize() - Starting polling mode");

          // Use proper Effect.promise for bot.launch
          yield* Effect.promise(() => self.bot!.launch({ dropPendingUpdates: false, allowedUpdates: ["message"] })).pipe(
            Effect.catchAll((error: any) => {
              console.log(`[DEBUG] TelegramSourcePlugin.initialize() - bot.launch() error: ${error}`);
              return Effect.fail(new PluginConfigurationError({
                message: `Bot launch failed: ${error instanceof Error ? error.message : String(error)}`,
                retryable: true,
                cause: error instanceof Error ? error : new Error(String(error))
              }));
            })
          );
          console.log("[DEBUG] TelegramSourcePlugin.initialize() - Bot launched successfully");

          yield* logger.logDebug("Telegram polling launched", {
            pluginId: self.id
          });
        }

        // Keep the bot alive until the fiber is interrupted
        console.log("[DEBUG] TelegramSourcePlugin.initialize() - Bot running, waiting for interruption");
        yield* Effect.never;
      });

      // Start bot as supervised background fiber with proper error handling
      console.log("[DEBUG] TelegramSourcePlugin.initialize() - Starting bot fiber");
      self.botFiber = yield* Effect.fork(
        botEffect.pipe(
          Effect.catchAll((error) => {
            console.log(`[DEBUG] Bot fiber error: ${error}`);
            return logger.logError("Bot fiber crashed", error, { pluginId: self.id });
          })
        )
      );
      console.log("[DEBUG] TelegramSourcePlugin.initialize() - Bot fiber started successfully");

      console.log("[DEBUG] TelegramSourcePlugin.initialize() - SUCCESS - Plugin initialized");
      yield* logger.logDebug("Telegram source plugin initialized successfully", {
        pluginId: self.id,
        mode: self.isWebhookMode ? 'webhook' : 'polling'
      });
    });
  }

  createRouter() {
    const os = implement(telegramContract).$context<{ state: StreamState | null }>();

    const search = os.search.handler(async ({ input, context, errors }) => {
      if (!this.bot) throw new Error("Plugin not initialized");
      const self = this;

      try {
        // Determine if we're resuming or starting fresh
        const existingState = context?.state;
        const isResume = existingState && existingState.phase !== 'initial';

        let currentState: StreamState;
        let searchPhase: 'collecting' | 'monitoring';

        if (isResume) {
          // Resume from existing state
          currentState = { ...existingState };
          searchPhase = currentState.phase === 'collecting' ? 'collecting' : 'monitoring';

          console.log(`[Telegram Search] Resuming from phase: ${currentState.phase}`);
        } else {
          // Fresh search
          currentState = {
            phase: 'initial',
            totalProcessed: 0,
            chatId: input.chatId,
          };
          searchPhase = 'collecting'; // Start collecting messages
          console.log(`[Telegram Search] Starting fresh search, maxResults: ${input.maxResults}`);
        }

        // Process updates from our internal queue (populated by bot.launch middleware)
        const searchEffect = Effect.succeed(() => {
          const allItems: SourceItem[] = [];
          let newLastUpdateId = currentState.lastUpdateId;

          // Drain updates from our queue
          const availableUpdates = self.updateQueue.splice(0, input.maxResults || POLLING_LIMIT);

          console.log(`[Telegram Search] Processing ${availableUpdates.length} updates from queue`);

          const processedItems: SourceItem[] = [];

          for (const update of availableUpdates) {
            // Filter by chatId if specified
            if (input.chatId && 'message' in update && update.message) {
              if (update.message.chat.id.toString() !== input.chatId) {
                continue;
              }
            }

            // Filter by text-only if specified
            if (input.textOnly && 'message' in update && update.message) {
              const hasText = 'text' in update.message && update.message.text;
              const hasCaption = 'caption' in update.message && update.message.caption;
              if (!hasText && !hasCaption) {
                continue;
              }
            }

            // Filter out commands if not included
            if (!input.includeCommands && 'message' in update && update.message) {
              if ('text' in update.message && update.message.text && update.message.text.startsWith('/')) {
                continue;
              }
            }

            const item = convertTelegramUpdateToSourceItem(update, self.botInfo);
            if (item) {
              processedItems.push(item);
            }

            // Track the latest update_id
            if (newLastUpdateId === undefined || update.update_id > newLastUpdateId) {
              newLastUpdateId = update.update_id;
            }
          }

          allItems.push(...processedItems);

          console.log(`[Telegram Search] Processed batch: ${processedItems.length} items, total: ${allItems.length}`);

          return { items: allItems, newLastUpdateId };
        }).pipe(Effect.map(fn => fn()));

        const searchResult = await Effect.runPromise(
          searchEffect.pipe(
            Effect.timeout(Duration.millis(input.budgetMs)),
            Effect.catchTag("TimeoutException", () =>
              Effect.fail(new Error('Search budget exceeded - increase budgetMs parameter'))
            )
          )
        );

        const { items, newLastUpdateId } = searchResult;

        // Truncate items if we exceed maxResults
        const finalItems = input.maxResults && items.length > input.maxResults
          ? items.slice(0, input.maxResults)
          : items;

        // Check if we've hit the maxResults limit
        const hasReachedLimit = input.maxResults !== undefined && finalItems.length >= input.maxResults;

        // Update state based on current context
        const nextState: StreamState = {
          totalProcessed: currentState.totalProcessed + finalItems.length,
          phase: currentState.phase,
          nextPollMs: input.livePollMs,
          lastUpdateId: newLastUpdateId || currentState.lastUpdateId,
          chatId: input.chatId || currentState.chatId,
        };

        if (finalItems.length > 0) {
          // Determine next phase
          if (currentState.phase === 'initial') {
            nextState.phase = StateTransitions.fromInitial(finalItems);
          } else if (currentState.phase === 'collecting') {
            nextState.phase = StateTransitions.fromCollecting(finalItems, hasReachedLimit);
          } else {
            nextState.phase = StateTransitions.fromMonitoring();
          }
        } else {
          // No items returned, switch to monitoring
          nextState.phase = 'monitoring';
        }

        console.log(`[Telegram Search] Next phase: ${nextState.phase}, nextPollMs: ${nextState.nextPollMs}`);

        return {
          items: finalItems,
          nextState
        };

      } catch (error) {
        return handleTelegramError(error, errors);
      }
    });

    return os.router({
      search,
    });
  }

  shutdown(): Effect.Effect<void, never, PluginLoggerTag> {
    const self = this;
    return Effect.gen(function* () {
      console.log("[DEBUG] TelegramSourcePlugin.shutdown() - START");
      const logger = yield* PluginLoggerTag;

      // Interrupt the bot fiber if it exists
      if (self.botFiber) {
        console.log("[DEBUG] TelegramSourcePlugin.shutdown() - Interrupting bot fiber");
        yield* Fiber.interrupt(self.botFiber).pipe(
          Effect.catchAll((error: any) => {
            console.log(`[DEBUG] TelegramSourcePlugin.shutdown() - Fiber interrupt error: ${error}`);
            return logger.logWarning("Failed to interrupt bot fiber cleanly", {
              pluginId: self.id,
              error: error instanceof Error ? error.message : String(error)
            });
          })
        );
        self.botFiber = null;
        console.log("[DEBUG] TelegramSourcePlugin.shutdown() - Bot fiber interrupted");
      }

      // Clean up bot instance
      if (self.bot) {
        console.log("[DEBUG] TelegramSourcePlugin.shutdown() - Stopping bot");
        self.bot!.stop('SIGTERM');
        self.bot = null;
        console.log("[DEBUG] TelegramSourcePlugin.shutdown() - Bot stopped");
      }

      // Clear update queue
      self.updateQueue = [];
      self.botInfo = null;

      console.log("[DEBUG] TelegramSourcePlugin.shutdown() - SUCCESS");
      yield* logger.logDebug("Telegram source plugin shutdown completed", {
        pluginId: self.id
      });
    });
  }
}

export default TelegramSourcePlugin;

import { implement } from "@orpc/server";
import { createPlugin } from "every-plugin";
import { Telegraf } from "telegraf";
import type { Update } from "telegraf/types";
import z from "zod";
import {
  type TelegramItem,
  type StreamState,
  type TelegramStreamEvent,
  telegramContract,
} from "./schemas";

const MAX_QUEUE_SIZE = 1000;

// Context type for the plugin
interface TelegramContext {
  bot: Telegraf;
  updateQueue: Update[];
  isWebhookMode: boolean;
}

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

function convertUpdateToTelegramItem(update: Update): TelegramItem | null {
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

  initialize: async (config): Promise<TelegramContext> => {
    const { variables, secrets } = config;
    // Determine mode based on domain presence
    const isWebhookMode = !!variables.domain;
    const updateQueue: Update[] = [];

    const bot = new Telegraf(secrets.botToken);

    // Validate bot token
    try {
      await bot.telegram.getMe();
    } catch (error) {
      const originalMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Bot token validation failed: ${originalMessage}`);
    }

    // Set up middleware to capture all updates
    bot.use(async (ctx, next) => {
      if (updateQueue.length >= MAX_QUEUE_SIZE) {
        updateQueue.shift();
      }
      updateQueue.push(ctx.update);
      await next();
    });

    if (isWebhookMode) {
      // Webhook mode setup
      const webhookUrl = `${variables.domain}/telegram/webhook`;
      try {
        await bot.telegram.setWebhook(webhookUrl, {
          secret_token: config.secrets?.webhookToken,
        });
        console.log(`[Telegram] Webhook registered: ${webhookUrl}`);
      } catch (error) {
        const originalMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Webhook registration failed: ${originalMessage}`);
      }
    } else {
      // Polling mode setup
      try {
        bot.launch({
          dropPendingUpdates: false,
          allowedUpdates: ["message", "edited_message", "channel_post", "edited_channel_post"]
        }).catch((launchError) => {
          console.error("[Telegram] Polling launch error:", launchError);
        });
        console.log("[Telegram] Polling started");
      } catch (error) {
        const originalMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Bot launch failed: ${originalMessage}`);
      }
    }

    return {
      bot,
      updateQueue,
      isWebhookMode
    };
  },

  createRouter: (context: TelegramContext) => {
    const os = implement(telegramContract);

    const webhook = os.webhook.handler(async ({ input }) => {
      // Add the update directly to queue
      if (context.updateQueue.length >= MAX_QUEUE_SIZE) {
        context.updateQueue.shift();
      }
      context.updateQueue.push(input as Update);

      return { processed: true };
    });

    const listen = os.listen.handler(async function* ({ input, errors }) {
      try {
        const availableUpdates = context.updateQueue.splice(0, input.maxResults || 100);

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

        // Convert filtered updates to TelegramItems and yield as stream events
        let itemIndex = 0;
        for (const update of filteredUpdates) {
          const item = convertUpdateToTelegramItem(update);
          if (item) {
            const state: StreamState = {
              totalProcessed: itemIndex + 1,
              lastUpdateId: update.update_id,
              chatId: input.chatId,
            };

            const event: TelegramStreamEvent = {
              item,
              state,
              metadata: { itemIndex }
            };

            yield event;
            itemIndex++;
          }
        }

      } catch (error) {
        handleTelegramError(error, errors);
      }
    });

    const sendMessage = os.sendMessage.handler(async ({ input, errors }) => {
      try {
        const result = await context.bot.telegram.sendMessage(
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
});

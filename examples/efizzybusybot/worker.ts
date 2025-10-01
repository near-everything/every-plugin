import { Effect } from "effect";
import type { Context } from "telegraf";
import type { Update } from "telegraf/types";
import type { NewMessage } from "./schemas/database";
import { DatabaseService } from "./services/db.service";
import { EmbeddingsService } from "./services/embeddings.service";
import { NearAiService } from "./services/nearai.service";

const BOT_OWNER_ID = Bun.env.BOT_OWNER_ID;

// Utility functions to extract data from Telegraf Context
const extractMessageContent = (ctx: Context<Update>) => {
  if (ctx.message && 'text' in ctx.message) {
    return ctx.message.text || '';
  }
  if (ctx.message && 'caption' in ctx.message) {
    return ctx.message.caption || '';
  }
  return '';
};

const extractContentType = (ctx: Context<Update>) => {
  if (!ctx.message) return 'unknown';
  
  if ('text' in ctx.message) return 'text';
  if ('photo' in ctx.message) return 'photo';
  if ('document' in ctx.message) return 'document';
  if ('video' in ctx.message) return 'video';
  if ('voice' in ctx.message) return 'voice';
  if ('audio' in ctx.message) return 'audio';
  if ('sticker' in ctx.message) return 'sticker';
  if ('location' in ctx.message) return 'location';
  if ('contact' in ctx.message) return 'contact';
  if ('animation' in ctx.message) return 'animation';
  if ('video_note' in ctx.message) return 'video_note';
  
  return 'unknown';
};

const extractExternalId = (ctx: Context<Update>) => {
  const chatId = ctx.chat?.id || 0;
  const messageId = ctx.message?.message_id || 0;
  return `${chatId}-${messageId}`;
};

const extractMessageUrl = (ctx: Context<Update>) => {
  if (!ctx.chat || !ctx.message) return undefined;
  
  // For channels and supergroups with usernames
  if (ctx.chat.type === 'channel' || ctx.chat.type === 'supergroup') {
    if ('username' in ctx.chat && ctx.chat.username) {
      return `https://t.me/${ctx.chat.username}/${ctx.message.message_id}`;
    }
  }
  
  return undefined;
};

const isCommand = (ctx: Context<Update>) => {
  const content = extractMessageContent(ctx);
  return content.startsWith('/');
};

const isReply = (ctx: Context<Update>) => {
  return !!(ctx.message && 'reply_to_message' in ctx.message && ctx.message.reply_to_message);
};

const hasMedia = (ctx: Context<Update>) => {
  if (!ctx.message) return false;
  
  return !!(
    ('photo' in ctx.message) ||
    ('document' in ctx.message) ||
    ('video' in ctx.message) ||
    ('voice' in ctx.message) ||
    ('audio' in ctx.message) ||
    ('sticker' in ctx.message) ||
    ('animation' in ctx.message) ||
    ('video_note' in ctx.message)
  );
};

// Convert Telegraf Context to database message format
const convertToDbMessage = (ctx: Context<Update>): NewMessage => {
  const content = extractMessageContent(ctx);
  const contentType = extractContentType(ctx);
  const externalId = extractExternalId(ctx);
  const url = extractMessageUrl(ctx);
  const isCmd = isCommand(ctx);
  
  return {
    externalId,
    content,
    contentType,
    createdAt: new Date(ctx.message?.date ? ctx.message.date * 1000 : Date.now()).toISOString(),
    url,
    
    pluginId: "@curatedotfun/telegram-source",
    
    authorId: ctx.from?.id?.toString(),
    authorUsername: ctx.from?.username,
    authorDisplayName: ctx.from?.first_name ? 
      `${ctx.from.first_name}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}` : 
      undefined,
    
    chatId: ctx.chat?.id?.toString() || '0',
    messageId: ctx.message?.message_id || 0,
    chatType: ctx.chat?.type || 'unknown',
    isCommand: isCmd,
    isReply: isReply(ctx),
    hasMedia: hasMedia(ctx),
    commandType: isCmd ? extractCommand(content) : null,
    
    processed: false,
    rawData: JSON.stringify(ctx.update),
  };
};

const isBotMentioned = (ctx: Context<Update>) => {
  const content = extractMessageContent(ctx).toLowerCase();
  return content.includes('@efizzybusybot') || content.includes('efizzybusybot');
};

const isFromOwner = (ctx: Context<Update>) => {
  return ctx.from?.id?.toString() === BOT_OWNER_ID;
};

const isReplyToBot = (ctx: Context<Update>) => {
  if (!ctx.message || !('reply_to_message' in ctx.message) || !ctx.message.reply_to_message) {
    return false;
  }
  return ctx.message.reply_to_message.from?.is_bot === true;
};

const isPrivateChat = (ctx: Context<Update>) => {
  return ctx.chat?.type === 'private';
};

const shouldRespond = (ctx: Context<Update>) => {
  return (
    isFromOwner(ctx) || 
    isBotMentioned(ctx) || 
    isReplyToBot(ctx) ||
    isPrivateChat(ctx)
  );
};

const extractCommand = (text: string) => {
  if (!text.startsWith('/')) return null;
  const parts = text.split(' ');
  return parts[0]?.substring(1); // Remove the "/" and return the command word
};

const generateAiResponse = (
  message: string,
  ctx: Context<Update>,
  conversationHistory: any[]
) =>
  Effect.gen(function* () {
    const nearAi = yield* NearAiService;
    const content = extractMessageContent(ctx);
    const isOwner = isFromOwner(ctx);

    const context = {
      chatId: ctx.chat?.id?.toString() || '0',
      authorId: ctx.from?.id?.toString(),
      authorUsername: ctx.from?.username,
      isFromOwner: isOwner,
      conversationHistory
    };

    const response = yield* nearAi.generateResponse(content, context);
    return { response, commandType: null };
  });

export const processMessage = (
  ctx: Context<Update>
) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const embeddings = yield* EmbeddingsService;
    
    try {
      const dbMessage = convertToDbMessage(ctx);
      const messageId = yield* db.insertMessage(dbMessage);
      
      if (messageId === 0) {
        return;
      }
      
      const content = extractMessageContent(ctx);
      const username = ctx.from?.username || 'unknown';
      
      // Log incoming message
      yield* Effect.logInfo("📥 Message received").pipe(
        Effect.annotateLogs({
          from: username,
          chatId: ctx.chat?.id?.toString(),
          preview: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
          updateId: ctx.update.update_id
        })
      );
      
      // Generate and store embedding for this message (for future context retrieval)
      if (content.trim().length > 0) {
        const messageEmbedding = yield* embeddings.generateEmbedding(content);
        yield* db.updateMessageEmbedding(messageId, messageEmbedding);
      }
      
      if (shouldRespond(ctx)) {
        const chatId = ctx.chat?.id?.toString() || '0';
        const conversationHistory = yield* db.getConversationHistory(chatId, 10);
        
        const { response, commandType } = yield* generateAiResponse(content, ctx, conversationHistory);
        
        if (response) {
          // Use Telegraf's built-in reply method instead of custom sendReply
          yield* Effect.tryPromise(() => ctx.reply(response)).pipe(
            Effect.catchAll((error) => 
              Effect.logError("Failed to send reply").pipe(
                Effect.annotateLogs({ 
                  error: error instanceof Error ? error.message : String(error),
                  username 
                }),
                Effect.as(Effect.void)
              )
            )
          );
          
          yield* Effect.logInfo("💬 AI response sent").pipe(
            Effect.annotateLogs({
              to: username,
              preview: response.slice(0, 50) + (response.length > 50 ? "..." : ""),
              commandType: commandType || undefined
            })
          );
          
          yield* db.markMessageRespondedTo(messageId);
        }
      }
      
      yield* db.markMessageProcessed(messageId);
      
    } catch (error) {
      yield* Effect.logError("Error processing message").pipe(
        Effect.annotateLogs({ error: error instanceof Error ? error.message : String(error) })
      );
      throw error;
    }
  });

export const processMessages = (contexts: Context<Update>[]) =>
  Effect.gen(function* () {
    for (const ctx of contexts) {
      yield* processMessage(ctx);
    }
  });

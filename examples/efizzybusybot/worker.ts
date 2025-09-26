import { Effect } from "effect";
import type { NewMessage } from "./schemas/database";
import { DatabaseService } from "./services/db.service";

// Constants
const EJLBRAEM_USER_ID = "1893641782";

// Utility functions to extract data from Telegraf Context
const extractMessageContent = (ctx) => {
  if (ctx.message && 'text' in ctx.message) {
    return ctx.message.text || '';
  }
  if (ctx.message && 'caption' in ctx.message) {
    return ctx.message.caption || '';
  }
  return '';
};

const extractContentType = (ctx) => {
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

const extractExternalId = (ctx) => {
  const chatId = ctx.chat?.id || 0;
  const messageId = ctx.message?.message_id || 0;
  return `${chatId}-${messageId}`;
};

const extractMessageUrl = (ctx) => {
  if (!ctx.chat || !ctx.message) return undefined;
  
  // For channels and supergroups with usernames
  if (ctx.chat.type === 'channel' || ctx.chat.type === 'supergroup') {
    if ('username' in ctx.chat && ctx.chat.username) {
      return `https://t.me/${ctx.chat.username}/${ctx.message.message_id}`;
    }
  }
  
  return undefined;
};

const isCommand = (ctx) => {
  const content = extractMessageContent(ctx);
  return content.startsWith('/');
};

const isReply = (ctx) => {
  return !!(ctx.message && 'reply_to_message' in ctx.message && ctx.message.reply_to_message);
};

const hasMedia = (ctx) => {
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
const convertToDbMessage = (ctx): NewMessage => {
  const content = extractMessageContent(ctx);
  const contentType = extractContentType(ctx);
  const externalId = extractExternalId(ctx);
  const url = extractMessageUrl(ctx);
  
  return {
    externalId,
    content,
    contentType,
    createdAt: new Date(ctx.message?.date ? ctx.message.date * 1000 : Date.now()).toISOString(),
    url,
    
    authorId: ctx.from?.id?.toString(),
    authorUsername: ctx.from?.username,
    authorDisplayName: ctx.from?.first_name ? 
      `${ctx.from.first_name}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}` : 
      undefined,
    
    chatId: ctx.chat?.id?.toString() || '0',
    messageId: ctx.message?.message_id || 0,
    chatType: ctx.chat?.type || 'unknown',
    isCommand: isCommand(ctx),
    isReply: isReply(ctx),
    hasMedia: hasMedia(ctx),
    
    processed: false,
    rawData: JSON.stringify(ctx.update),
  };
};

// Check if bot is mentioned in the message
const isBotMentioned = (ctx) => {
  const content = extractMessageContent(ctx).toLowerCase();
  return content.includes('@efizzybusybot') || content.includes('efizzybusybot');
};

// Check if message is from ejlbraem
const isFromEjlbraem = (ctx) => {
  return ctx.from?.id?.toString() === EJLBRAEM_USER_ID;
};

// Generate reply text based on message analysis
const generateReply = (ctx) => {
  const username = ctx.from?.username || ctx.from?.first_name || 'friend';
  
  // Priority 1: Check if from ejlbraem
  if (isFromEjlbraem(ctx)) {
    return "daddy!";
  }
  
  // Priority 2: Check if bot is mentioned
  if (isBotMentioned(ctx)) {
    return `hey! ${username}`;
  }
  
  // No reply needed
  return null;
};

// Main worker function to process a telegram message
export const processMessage = (
  ctx,
  sendReply: (chatId: string, text: string, replyToMessageId?: number) => Effect.Effect<void, Error>
) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    
    try {
      // Always save to database first
      const dbMessage = convertToDbMessage(ctx);
      const messageId = yield* db.insertMessage(dbMessage);
      
      if (messageId === 0) {
        console.log(`📝 Duplicate message skipped: ${dbMessage.externalId}`);
        return;
      }
      
      const content = extractMessageContent(ctx);
      const username = ctx.from?.username || 'unknown';
      console.log(`📝 Saved message ${messageId}: ${username} - "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`);
      
      // Check if we need to reply
      const replyText = generateReply(ctx);
      
      if (replyText) {
        // Send reply
        const chatId = ctx.chat?.id?.toString() || '0';
        const replyToMessageId = ctx.message?.message_id;
        
        yield* sendReply(chatId, replyText, replyToMessageId).pipe(
          Effect.catchAll((error) => {
            console.error(`❌ Failed to send reply: ${error}`);
            return Effect.void;
          })
        );
        
        console.log(`💬 Replied to ${username}: "${replyText}"`);
      }
      
      // Mark as processed
      yield* db.markMessageProcessed(messageId);
      
    } catch (error) {
      console.error(`❌ Error processing message ${extractExternalId(ctx)}:`, error);
      throw error;
    }
  });

// Batch process multiple messages
export const processMessages = (
  contexts,
  sendReply: (chatId: string, text: string, replyToMessageId?: number) => Effect.Effect<void, Error>
) =>
  Effect.gen(function* () {
    console.log(`🔄 Processing batch of ${contexts.length} messages`);
    
    for (const ctx of contexts) {
      yield* processMessage(ctx, sendReply);
    }
    
    console.log(`✅ Completed processing ${contexts.length} messages`);
  });

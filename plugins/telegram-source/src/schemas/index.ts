import { CommonPluginErrors } from "every-plugin";
import { eventIterator, oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import type { Context } from "telegraf";
import type { Update } from "telegraf/types";

export const TelegramContextSchema = z.custom<Context>((val): val is Context => {
  return typeof val === 'object' && val !== null && 'update' in val && 'telegram' in val;
});

// Contract definition for the Telegram source plugin
export const telegramContract = oc.router({
  webhook: oc
    .route({ method: 'POST', path: '/webhook' })
    .input(z.custom<Update>())
    .output(z.object({
      processed: z.boolean(),
    }))
    .errors(CommonPluginErrors),

  listen: oc
    .route({ method: 'POST', path: '/listen' })
    .input(z.object({
      chatId: z.string().optional(),
      maxResults: z.number().min(1).optional().default(100),
      messageTypes: z.array(z.enum(['text', 'photo', 'document', 'video', 'voice', 'audio', 'sticker', 'location', 'contact', 'animation', 'video_note'])).optional(),
      chatTypes: z.array(z.enum(['private', 'group', 'supergroup', 'channel'])).optional(),
      commands: z.array(z.string()).optional(),
      idleTimeout: z.number().min(100).optional(), // Timeout in ms after no new messages
    }))
    .output(eventIterator(TelegramContextSchema))
    .errors(CommonPluginErrors),

  sendMessage: oc
    .route({ method: 'POST', path: '/sendMessage' })
    .input(z.object({
      chatId: z.string(),
      text: z.string(),
      replyToMessageId: z.number().optional(),
      parseMode: z.enum(['HTML', 'Markdown', 'MarkdownV2']).optional(),
    }))
    .output(z.object({
      messageId: z.number(),
      success: z.boolean(),
      chatId: z.string(),
    }))
    .errors(CommonPluginErrors)
});

// Export types for use in implementation
export type TelegramContract = typeof telegramContract;
export type TelegramContext = Context;

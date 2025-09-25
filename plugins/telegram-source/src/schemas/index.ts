import { oc } from "@orpc/contract";
import { eventIterator } from "@orpc/server";
import { CommonPluginErrors } from "every-plugin";
import { z } from "zod";
import type { Update, Message } from "telegraf/types";

export const TelegramItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  contentType: z.enum(['text', 'image', 'video', 'audio', 'file', 'sticker']),
  createdAt: z.string(),
  url: z.string().optional(),
  
  author: z.object({
    id: z.string(),
    username: z.string().optional(),
    displayName: z.string(),
  }).optional(),
  
  chatId: z.string(),
  messageId: z.number(),
  isCommand: z.boolean(),
  isReply: z.boolean(),
  hasMedia: z.boolean(),
  chatType: z.enum(['private', 'group', 'supergroup', 'channel']),
  
  raw: z.custom<Update>(),
  message: z.custom<Message>(),
});

// State schema for streaming operations
export const streamStateSchema = z.object({
  totalProcessed: z.number().default(0),
  lastUpdateId: z.number().optional(), // Telegram's update_id for resumption
  chatId: z.string().nullish(), // Track specific chat if configured
});

// Schema for streaming events
export const telegramStreamEventSchema = z.object({
  item: TelegramItemSchema,
  state: streamStateSchema,
  metadata: z.object({
    itemIndex: z.number(),
  })
});

// Contract definition for the Telegram source plugin
export const telegramContract = oc.router({
  webhook: oc
    .route({ method: 'POST', path: '/webhook' })
    .input(z.unknown())
    .output(z.object({
      processed: z.boolean(),
    }))
    .errors(CommonPluginErrors),

  listen: oc
    .route({ method: 'POST', path: '/listen' })
    .input(z.object({
      chatId: z.string().optional(),
      maxResults: z.number().min(1).optional().default(100),
      includeCommands: z.boolean().optional().default(true),
      textOnly: z.boolean().optional().default(false),
    }))
    .output(eventIterator(telegramStreamEventSchema))
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
export type TelegramItem = z.infer<typeof TelegramItemSchema>;
export type StreamState = z.infer<typeof streamStateSchema>;
export type TelegramStreamEvent = z.infer<typeof telegramStreamEventSchema>;

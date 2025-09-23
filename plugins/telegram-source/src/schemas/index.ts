import { oc } from "@orpc/contract";
import { CommonPluginErrors, createConfigSchema } from "every-plugin";
import { z } from "zod";
import type { Update, Message } from "telegraf/types";

export const SourceItemSchema = z.object({
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

// State schema fro streaming operations
export const stateSchema = z.object({
  totalProcessed: z.number().default(0),
  lastUpdateId: z.number().optional(), // Telegram's update_id for resumption
  nextPollMs: z.number().nullable().optional(), // For streaming: null = terminate, number = delay
  chatId: z.string().nullish(), // Track specific chat if configured
});

// Contract definition for the Telegram source plugin
export const telegramContract = {
  webhook: oc
    .input(z.unknown())
    .output(z.object({
      processed: z.boolean(),
    }))
    .errors(CommonPluginErrors)
    .meta({ "streamable": "false" }),

  listen: oc
    .input(z.object({
      chatId: z.string().optional(),
      maxResults: z.number().min(1).optional().default(100),
      budgetMs: z.number().min(1000).max(300000).optional().default(30000),
      includeCommands: z.boolean().optional().default(true),
      textOnly: z.boolean().optional().default(false),
    }))
    .output(z.object({
      items: z.array(SourceItemSchema),
      nextState: stateSchema
    }))
    .errors(CommonPluginErrors)
    .meta({ "streamable": "true" }),

  sendMessage: oc
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
    .meta({ "streamable": "false" }),
};

// Export types for use in implementation
export type TelegramContract = typeof telegramContract;
export type SourceItem = z.infer<typeof SourceItemSchema>;
export type StreamState = z.infer<typeof stateSchema>;

export const TelegramSourceConfigSchema = createConfigSchema(
  // Variables (non-sensitive config)
  z.object({
    domain: z.string().min(1).optional(), // Optional - if not provided, use polling mode
    timeout: z.number().default(30000),
    defaultMaxResults: z.number().min(1).max(1000).default(100),
  }),
  // Secrets (sensitive config, hydrated at runtime)
  z.object({
    webhookToken: z.string().optional(),
    botToken: z.string().min(1, "Telegram bot token is required"),
  }),
);

// Derived types
export type TelegramSourceConfig = z.infer<typeof TelegramSourceConfigSchema>;

import { oc } from "@orpc/contract";
import { CommonPluginErrors, createConfigSchema } from "every-plugin";
import { z } from "zod";

// Source item schema that plugins return
const sourceItemSchema = z.object({
  externalId: z.string(),
  content: z.string(),
  contentType: z.string().optional(),
  createdAt: z.string().optional(),
  url: z.string().optional(),
  authors: z.array(z.object({
    id: z.string().optional(),
    username: z.string().optional(),
    displayName: z.string().optional(),
    url: z.string().optional(),
  })).optional(),
  isMentioned: z.boolean().optional(), // Bot was mentioned/tagged
  raw: z.unknown(), // Original Telegram message
});

// Telegram-specific enums and types
const TelegramChatTypeSchema = z.enum(['private', 'group', 'supergroup', 'channel']);

// State schema for streaming operations - adapted for Telegram's real-time nature
export const stateSchema = z.object({
  phase: z.enum(['initial', 'collecting', 'monitoring']), // Adapted for Telegram reality
  lastUpdateId: z.number().optional(), // Telegram's update_id for resumption
  totalProcessed: z.number().default(0),
  nextPollMs: z.number().nullable().optional(), // For streaming: null = terminate, number = delay
  chatId: z.string().nullish(), // Track specific chat if configured - allows null and undefined
});

// Telegram message schema for individual messages
const TelegramMessageObjectSchema = z.object({
  message_id: z.number(),
  date: z.number(),
  text: z.string().optional(),
  caption: z.string().optional(), // For media messages
  chat: z.object({
    id: z.number(),
    type: TelegramChatTypeSchema,
    title: z.string().optional(),
    username: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }),
  from: z.object({
    id: z.number(),
    is_bot: z.boolean(),
    first_name: z.string(),
    last_name: z.string().optional(),
    username: z.string().optional(),
    language_code: z.string().optional(),
  }).optional(),
  reply_to_message: z.object({
    message_id: z.number(),
    from: z.object({
      id: z.number(),
      first_name: z.string(),
      username: z.string().optional(),
    }).optional(),
  }).optional(),
  forward_from: z.object({
    id: z.number(),
    first_name: z.string(),
    username: z.string().optional(),
  }).optional(),
}).catchall(z.unknown());

// Proper Telegram Update schema that handles all update types
export const TelegramUpdateSchema = z.object({
  update_id: z.number(),
  message: TelegramMessageObjectSchema.optional(),
  edited_message: TelegramMessageObjectSchema.optional(),
  channel_post: TelegramMessageObjectSchema.optional(),
  edited_channel_post: TelegramMessageObjectSchema.optional(),
  callback_query: z.object({
    id: z.string(),
    from: z.object({
      id: z.number(),
      is_bot: z.boolean(),
      first_name: z.string(),
      last_name: z.string().optional(),
      username: z.string().optional(),
    }),
    message: TelegramMessageObjectSchema.optional(),
    data: z.string().optional(),
  }).optional(),
}).catchall(z.unknown());

// Keep the old schema name for backward compatibility but use the new structure
export const TelegramMessageSchema = TelegramUpdateSchema;

// Contract definition for the Telegram source plugin - simplified for streaming only
export const telegramContract = {
  // Core search/monitor function (main entry point)
  search: oc
    .input(z.object({
      chatId: z.string().optional(), // Monitor specific chat or all accessible chats
      maxResults: z.number().min(1).optional(),
      budgetMs: z.number().min(5000).max(300000).optional().default(60000),
      livePollMs: z.number().min(1000).max(3600000).optional().default(30000), // 30 second default
      includeCommands: z.boolean().optional().default(false), // Include bot commands in results
      textOnly: z.boolean().optional().default(true), // Only include text messages
    }))
    .output(z.object({
      items: z.array(sourceItemSchema),
      nextState: stateSchema
    }))
    .errors(CommonPluginErrors)
    .meta({ "streamable": "true" }),
};

// Export types for use in implementation
export type TelegramContract = typeof telegramContract;
export type SourceItem = z.infer<typeof sourceItemSchema>;
export type TelegramChatType = z.infer<typeof TelegramChatTypeSchema>;
export type StreamState = z.infer<typeof stateSchema>;
export type TelegramUpdate = z.infer<typeof TelegramUpdateSchema>;
export type TelegramMessage = z.infer<typeof TelegramMessageSchema>; // Keep for backward compatibility

// Config schema with variables and secrets
export const TelegramSourceConfigSchema = createConfigSchema(
  // Variables (non-sensitive config)
  z.object({
    baseUrl: z.string().optional(), // For webhook mode - if provided, uses webhooks instead of polling
    timeout: z.number().optional().default(30000),
    defaultMaxResults: z.number().min(1).max(1000).optional().default(100),
    webhookPath: z.string().optional().default("/telegram-webhook"), // Webhook endpoint path
  }),
  // Secrets (sensitive config, hydrated at runtime)
  z.object({
    botToken: z.string().min(1, "Telegram bot token is required"),
  }),
);

// Derived types
export type TelegramSourceConfig = z.infer<typeof TelegramSourceConfigSchema>;

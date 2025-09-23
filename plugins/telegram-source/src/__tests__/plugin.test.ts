import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { PluginRegistry } from "every-plugin";
import { PluginRuntime } from "every-plugin";
import { createTestLayer, type TestPluginMap } from "every-plugin/testing";
import { beforeEach, describe, vi } from "vitest";
import { Telegraf } from "telegraf";
import TelegramSourcePlugin from "../index";
import type { SourceItem, StreamState } from "../schemas";
import { mockTelegramUpdates, mockBotInfo } from "./fixtures/telegram-updates";
import type { Update } from "telegraf/types";

// Helper function to extract message from any update type
function getMessageFromUpdate(update: Update) {
  return ('message' in update && update.message) ||
         ('edited_message' in update && update.edited_message) ||
         ('channel_post' in update && update.channel_post) ||
         ('edited_channel_post' in update && update.edited_channel_post) ||
         null;
}

// Helper function to extract text content from message
function getTextFromMessage(message: any) {
  return ('text' in message && message.text) ||
         ('caption' in message && message.caption) ||
         null;
}

// Helper function to detect if message mentions the bot
function isBotMentioned(update: Update, botUsername: string = "testbot"): boolean {
  const message = getMessageFromUpdate(update);
  if (!message) return false;

  // Check for @mention in entities
  if ('entities' in message && message.entities) {
    const hasMention = message.entities.some(entity => 
      entity.type === 'mention' && 
      getTextFromMessage(message)?.substring(entity.offset, entity.offset + entity.length) === `@${botUsername}`
    );
    if (hasMention) return true;
  }

  // Check for reply to bot
  if ('reply_to_message' in message && message.reply_to_message) {
    return message.reply_to_message.from?.username === botUsername;
  }

  return false;
}

// Mock Telegraf
vi.mock("telegraf");

// Test registry for telegram-source plugin tests
const TEST_REGISTRY: PluginRegistry = {
  "@curatedotfun/telegram-source": {
    remoteUrl: "http://localhost:3014/remoteEntry.js",
    type: "source",
    version: "1.0.0",
    description: "Telegram source plugin for unit testing",
  },
};

const TEST_CONFIG = {
  variables: {
    domain: "https://test-domain.com",
    webhookPort: 3001,
    webhookPath: "/webhook",
    secretToken: "test-secret-token",
    timeout: 30000,
    defaultMaxResults: 100,
  },
  secrets: {
    botToken: "123456789:ABCdefGHIjklMNOpqrsTUVwxyZ",
  },
};

const SECRETS_CONFIG = {
  TELEGRAM_BOT_TOKEN: "123456789:ABCdefGHIjklMNOpqrsTUVwxyZ",
};

// Plugin map for tests
const TEST_PLUGIN_MAP: TestPluginMap = {
  "@curatedotfun/telegram-source": TelegramSourcePlugin,
};

describe("Telegram Source Plugin Tests", () => {
  const testLayer = createTestLayer({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG,
  }, TEST_PLUGIN_MAP);

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup Telegraf mock
    const mockTelegram = {
      getMe: vi.fn().mockResolvedValue(mockBotInfo),
      setWebhook: vi.fn().mockResolvedValue(true),
      sendMessage: vi.fn().mockResolvedValue({
        message_id: 123,
        date: Math.floor(Date.now() / 1000),
        text: "Test response message",
        chat: {
          id: 12345,
          type: "private",
          first_name: "Test",
          last_name: "User"
        },
        from: mockBotInfo
      }),
    };

    const mockBot = {
      telegram: mockTelegram,
      use: vi.fn(),
      stop: vi.fn(),
    };

    vi.mocked(Telegraf).mockImplementation(() => mockBot as any);
  });

  describe("Plugin Initialization", () => {
    it.effect("should initialize plugin successfully", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        expect(plugin).toBeDefined();
        expect(plugin.plugin.id).toBe("@curatedotfun/telegram-source");
        expect(plugin.plugin.type).toBe("source");
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should fail initialization without bot token", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        return yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", {
          ...TEST_CONFIG,
          secrets: { botToken: "" }
        }).pipe(
          Effect.catchAll((error: any) => {
            const errorMessage = error.message || error.cause?.message || String(error);
            expect(errorMessage).toContain("Telegram bot token");
            return Effect.succeed("configuration-error-handled");
          }),
        );
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );
  });

  describe("Webhook Procedure", () => {
    it.effect("should process webhook with text message", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.textMessage,
          state: null,
        });

        expect(output).toBeDefined();
        const typedResult = output as { processed: boolean };
        expect(typedResult.processed).toBe(true);
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should process webhook with group message", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.groupMessage,
          state: null,
        });

        expect(output).toBeDefined();
        const typedResult = output as { processed: boolean };
        expect(typedResult.processed).toBe(true);
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should process webhook with bot mention", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.botMention,
          state: null,
        });

        expect(output).toBeDefined();
        const typedResult = output as { processed: boolean };
        expect(typedResult.processed).toBe(true);
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should process webhook with command message", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.commandMessage,
          state: null,
        });

        expect(output).toBeDefined();
        const typedResult = output as { processed: boolean };
        expect(typedResult.processed).toBe(true);
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should process webhook with media message", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.mediaMessage,
          state: null,
        });

        expect(output).toBeDefined();
        const typedResult = output as { processed: boolean };
        expect(typedResult.processed).toBe(true);
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );
  });

  describe("Listen Procedure", () => {
    it.effect("should retrieve messages from queue after webhook", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        // First, add some messages via webhook
        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.textMessage,
          state: null,
        });

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.groupMessage,
          state: null,
        });

        // Then retrieve them via listen
        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: {
            maxResults: 10,
            includeCommands: true,
            textOnly: false,
          },
          state: null,
        });

        expect(output).toBeDefined();
        const typedResult = output as { items: SourceItem[]; nextState: StreamState };
        expect(typedResult.items).toBeDefined();
        expect(Array.isArray(typedResult.items)).toBe(true);
        expect(typedResult.items.length).toBe(2);
        expect(typedResult.nextState).toBeDefined();

        // Check first item (text message)
        const firstItem = typedResult.items[0];
        const firstMessage = getMessageFromUpdate(firstItem);
        expect(firstMessage?.chat.id + "-" + firstMessage?.message_id).toBe("12345-1");
        expect(getTextFromMessage(firstMessage)).toBe("Hello bot! This is a test message.");
        expect(firstMessage?.from?.username).toBe("testuser");
        expect(firstMessage?.from?.first_name + " " + firstMessage?.from?.last_name).toBe("Test User");

        // Check second item (group message)
        const secondItem = typedResult.items[1];
        const secondMessage = getMessageFromUpdate(secondItem);
        expect(secondMessage?.chat.id + "-" + secondMessage?.message_id).toBe("-100123456789-2");
        expect(getTextFromMessage(secondMessage)).toBe("Group message here!");
        expect(secondMessage?.from?.username).toBe("groupuser");
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should filter by chatId", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        // Add messages from different chats
        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.textMessage, // chat id: 12345
          state: null,
        });

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.groupMessage, // chat id: -100123456789
          state: null,
        });

        // Filter by specific chat
        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: {
            chatId: "12345",
            maxResults: 10,
          },
          state: null,
        });

        const typedResult = output as { items: SourceItem[]; nextState: StreamState };
        expect(typedResult.items.length).toBe(1);
        const message = getMessageFromUpdate(typedResult.items[0]);
        expect(message?.chat.id + "-" + message?.message_id).toBe("12345-1");
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should filter text-only messages", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        // Add text and media messages
        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.textMessage,
          state: null,
        });

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.mediaMessage,
          state: null,
        });

        // Filter text-only
        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: {
            textOnly: true,
            maxResults: 10,
          },
          state: null,
        });

        const typedResult = output as { items: SourceItem[]; nextState: StreamState };
        expect(typedResult.items.length).toBe(2); // Both have text/caption
        const firstMessage = getMessageFromUpdate(typedResult.items[0]);
        const secondMessage = getMessageFromUpdate(typedResult.items[1]);
        expect(getTextFromMessage(firstMessage)).toBe("Hello bot! This is a test message.");
        expect(getTextFromMessage(secondMessage)).toBe("Check out this photo!");
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should exclude commands when includeCommands is false", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        // Add regular message and command
        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.textMessage,
          state: null,
        });

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.commandMessage,
          state: null,
        });

        // Exclude commands
        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: {
            includeCommands: false,
            maxResults: 10,
          },
          state: null,
        });

        const typedResult = output as { items: SourceItem[]; nextState: StreamState };
        expect(typedResult.items.length).toBe(1);
        const message = getMessageFromUpdate(typedResult.items[0]);
        expect(getTextFromMessage(message)).toBe("Hello bot! This is a test message.");
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should detect bot mentions correctly", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        // Add bot mention and reply to bot
        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.botMention,
          state: null,
        });

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.replyToBot,
          state: null,
        });

        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: {
            maxResults: 10,
          },
          state: null,
        });

        const typedResult = output as { items: SourceItem[]; nextState: StreamState };
        expect(typedResult.items.length).toBe(2);
        
        // Both should be marked as mentioned
        expect(isBotMentioned(typedResult.items[0])).toBe(true); // @testbot mention
        expect(isBotMentioned(typedResult.items[1])).toBe(true); // reply to bot
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );
  });

  describe("SendMessage Procedure", () => {
    it.effect("should send message successfully", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "sendMessage" as const,
          input: {
            chatId: "12345",
            text: "Hello from test!",
          },
          state: null,
        });

        expect(output).toBeDefined();
        const typedResult = output as { messageId: number; success: boolean; chatId: string };
        expect(typedResult.success).toBe(true);
        expect(typedResult.messageId).toBe(123);
        expect(typedResult.chatId).toBe("12345");
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should send reply message", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "sendMessage" as const,
          input: {
            chatId: "12345",
            text: "This is a reply",
            replyToMessageId: 456,
          },
          state: null,
        });

        expect(output).toBeDefined();
        const typedResult = output as { messageId: number; success: boolean; chatId: string };
        expect(typedResult.success).toBe(true);
        expect(typedResult.messageId).toBe(123);
        expect(typedResult.chatId).toBe("12345");
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should send message with parse mode", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "sendMessage" as const,
          input: {
            chatId: "12345",
            text: "*Bold text* and _italic text_",
            parseMode: "Markdown",
          },
          state: null,
        });

        expect(output).toBeDefined();
        const typedResult = output as { messageId: number; success: boolean; chatId: string };
        expect(typedResult.success).toBe(true);
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );
  });

  describe("Error Handling", () => {
    it.effect("should handle invalid webhook input", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        // This should not throw since we use z.unknown() for webhook input
        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: { invalid: "data" },
          state: null,
        });

        expect(output).toBeDefined();
        const typedResult = output as { processed: boolean };
        expect(typedResult.processed).toBe(true);
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should handle empty queue in listen", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: {
            maxResults: 10,
          },
          state: null,
        });

        expect(output).toBeDefined();
        const typedResult = output as { items: SourceItem[]; nextState: StreamState };
        expect(typedResult.items).toBeDefined();
        expect(Array.isArray(typedResult.items)).toBe(true);
        expect(typedResult.items.length).toBe(0);
        expect(typedResult.nextState).toBeDefined();
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );
  });
});

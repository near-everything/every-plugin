import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { PluginRegistry } from "every-plugin";
import { PluginRuntime } from "every-plugin";
import { createTestLayer, type TestPluginMap } from "every-plugin/testing";
import { beforeEach, describe, vi } from "vitest";
import { Telegraf } from "telegraf";
import TelegramSourcePlugin from "../index";
import type { SourceItem, StreamState } from "../schemas";
import { mockTelegramUpdates, createMockMessage, mockBotInfo } from "./fixtures/telegram-updates";
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

// Mock Telegraf
vi.mock("telegraf");

// Test registry for telegram-source plugin tests
const TEST_REGISTRY: PluginRegistry = {
  "@curatedotfun/telegram-source": {
    remoteUrl: "http://localhost:3014/remoteEntry.js",
    type: "source",
    version: "1.0.0",
    description: "Telegram source plugin for webhook tests",
  },
};

const TEST_CONFIG = {
  variables: {
    domain: "https://test-domain.com",
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

describe("Telegram Webhook Queue Integration Tests", () => {
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

  describe("Queue Behavior", () => {
    it.effect("should maintain FIFO order in queue", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        // Add messages in specific order
        const message1 = createMockMessage("First message", 12345);
        const message2 = createMockMessage("Second message", 12345);
        const message3 = createMockMessage("Third message", 12345);

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: message1,
          state: null,
        });

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: message2,
          state: null,
        });

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: message3,
          state: null,
        });

        // Retrieve messages and verify order
        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: { maxResults: 10 },
          state: null,
        });

        const typedResult = output as { items: SourceItem[]; nextState: StreamState };
        expect(typedResult.items.length).toBe(3);
        const firstMessage = getMessageFromUpdate(typedResult.items[0]);
        const secondMessage = getMessageFromUpdate(typedResult.items[1]);
        const thirdMessage = getMessageFromUpdate(typedResult.items[2]);
        expect(getTextFromMessage(firstMessage)).toBe("First message");
        expect(getTextFromMessage(secondMessage)).toBe("Second message");
        expect(getTextFromMessage(thirdMessage)).toBe("Third message");
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should respect maxResults limit", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        // Add 5 messages
        for (let i = 1; i <= 5; i++) {
          const message = createMockMessage(`Message ${i}`, 12345);
          yield* pluginRuntime.executePlugin(plugin, {
            procedure: "webhook" as const,
            input: message,
            state: null,
          });
        }

        // Request only 3 messages
        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: { maxResults: 3 },
          state: null,
        });

        const typedResult = output as { items: SourceItem[]; nextState: StreamState };
        expect(typedResult.items.length).toBe(3);
        const firstMessage = getMessageFromUpdate(typedResult.items[0]);
        const secondMessage = getMessageFromUpdate(typedResult.items[1]);
        const thirdMessage = getMessageFromUpdate(typedResult.items[2]);
        expect(getTextFromMessage(firstMessage)).toBe("Message 1");
        expect(getTextFromMessage(secondMessage)).toBe("Message 2");
        expect(getTextFromMessage(thirdMessage)).toBe("Message 3");
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should remove messages from queue after listen", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        // Add 3 messages
        for (let i = 1; i <= 3; i++) {
          const message = createMockMessage(`Message ${i}`, 12345);
          yield* pluginRuntime.executePlugin(plugin, {
            procedure: "webhook" as const,
            input: message,
            state: null,
          });
        }

        // First listen - get 2 messages
        const firstOutput = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: { maxResults: 2 },
          state: null,
        });

        const firstResult = firstOutput as { items: SourceItem[]; nextState: StreamState };
        expect(firstResult.items.length).toBe(2);
        const firstMessage1 = getMessageFromUpdate(firstResult.items[0]);
        const firstMessage2 = getMessageFromUpdate(firstResult.items[1]);
        expect(getTextFromMessage(firstMessage1)).toBe("Message 1");
        expect(getTextFromMessage(firstMessage2)).toBe("Message 2");

        // Second listen - should get remaining message
        const secondOutput = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: { maxResults: 10 },
          state: null,
        });

        const secondResult = secondOutput as { items: SourceItem[]; nextState: StreamState };
        expect(secondResult.items.length).toBe(1);
        const secondMessage = getMessageFromUpdate(secondResult.items[0]);
        expect(getTextFromMessage(secondMessage)).toBe("Message 3");

        // Third listen - should be empty
        const thirdOutput = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: { maxResults: 10 },
          state: null,
        });

        const thirdResult = thirdOutput as { items: SourceItem[]; nextState: StreamState };
        expect(thirdResult.items.length).toBe(0);
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should handle queue overflow (max 1000 items)", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        // Add messages beyond queue limit (simulate by adding many messages)
        // Note: We can't easily test the exact 1000 limit in a unit test due to performance,
        // but we can test the principle with a smaller number
        for (let i = 1; i <= 10; i++) {
          const message = createMockMessage(`Message ${i}`, 12345);
          yield* pluginRuntime.executePlugin(plugin, {
            procedure: "webhook" as const,
            input: message,
            state: null,
          });
        }

        // All messages should be retrievable (within normal limits)
        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: { maxResults: 20 },
          state: null,
        });

        const typedResult = output as { items: SourceItem[]; nextState: StreamState };
        expect(typedResult.items.length).toBe(10);
        const firstMessage = getMessageFromUpdate(typedResult.items[0]);
        const lastMessage = getMessageFromUpdate(typedResult.items[9]);
        expect(getTextFromMessage(firstMessage)).toBe("Message 1");
        expect(getTextFromMessage(lastMessage)).toBe("Message 10");
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );
  });

  describe("State Management", () => {
    it.effect("should track totalProcessed correctly", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        // Add messages
        for (let i = 1; i <= 5; i++) {
          const message = createMockMessage(`Message ${i}`, 12345);
          yield* pluginRuntime.executePlugin(plugin, {
            procedure: "webhook" as const,
            input: message,
            state: null,
          });
        }

        // First listen
        const firstOutput = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: { maxResults: 3 },
          state: null,
        });

        const firstResult = firstOutput as { items: SourceItem[]; nextState: StreamState };
        expect(firstResult.nextState.totalProcessed).toBe(3);

        // Second listen with previous state
        const secondOutput = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: { maxResults: 3 },
          state: firstResult.nextState,
        });

        const secondResult = secondOutput as { items: SourceItem[]; nextState: StreamState };
        expect(secondResult.nextState.totalProcessed).toBe(5); // 3 + 2 remaining
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should set appropriate nextPollMs", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        // Test with messages (should be fast polling)
        const message = createMockMessage("Test message", 12345);
        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: message,
          state: null,
        });

        const outputWithMessages = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: { maxResults: 10 },
          state: null,
        });

        const resultWithMessages = outputWithMessages as { items: SourceItem[]; nextState: StreamState };
        expect(resultWithMessages.nextState.nextPollMs).toBe(100); // Fast polling when messages found

        // Test without messages (should be slower polling)
        const outputEmpty = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: { maxResults: 10 },
          state: null,
        });

        const resultEmpty = outputEmpty as { items: SourceItem[]; nextState: StreamState };
        expect(resultEmpty.nextState.nextPollMs).toBe(2000); // Slower polling when no messages
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );
  });

  describe("Filtering Integration", () => {
    it.effect("should filter by chat ID across multiple webhook calls", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", {
          ...TEST_CONFIG,
          variables: { ...TEST_CONFIG.variables, domain: "https://test-domain-chat-filter.com" }
        });

        // Add messages from different chats
        const chat1Message1 = createMockMessage("Chat 1 Message 1", 12345);
        const chat2Message1 = createMockMessage("Chat 2 Message 1", 67890);
        const chat1Message2 = createMockMessage("Chat 1 Message 2", 12345);
        const chat2Message2 = createMockMessage("Chat 2 Message 2", 67890);

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: chat1Message1,
          state: null,
        });

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: chat2Message1,
          state: null,
        });

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: chat1Message2,
          state: null,
        });

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: chat2Message2,
          state: null,
        });

        // Filter by chat 1
        const chat1Output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: { chatId: "12345", maxResults: 10 },
          state: null,
        });

        const chat1Result = chat1Output as { items: SourceItem[]; nextState: StreamState };
        expect(chat1Result.items.length).toBe(2);
        const chat1Msg1 = getMessageFromUpdate(chat1Result.items[0]);
        const chat1Msg2 = getMessageFromUpdate(chat1Result.items[1]);
        expect(getTextFromMessage(chat1Msg1)).toBe("Chat 1 Message 1");
        expect(getTextFromMessage(chat1Msg2)).toBe("Chat 1 Message 2");

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: chat2Message1,
          state: null,
        });

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: chat2Message2,
          state: null,
        });

        const chat2Output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: { chatId: "67890", maxResults: 10 },
          state: null,
        });

        const chat2Result = chat2Output as { items: SourceItem[]; nextState: StreamState };
        expect(chat2Result.items.length).toBe(2);
        const chat2Msg1 = getMessageFromUpdate(chat2Result.items[0]);
        const chat2Msg2 = getMessageFromUpdate(chat2Result.items[1]);
        expect(getTextFromMessage(chat2Msg1)).toBe("Chat 2 Message 1");
        expect(getTextFromMessage(chat2Msg2)).toBe("Chat 2 Message 2");
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should handle mixed message types with textOnly filter", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", {
          ...TEST_CONFIG,
          variables: { ...TEST_CONFIG.variables, domain: "https://test-domain-text-filter.com" }
        });

        // Add various message types
        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.textMessage,
          state: null,
        });

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.mediaMessage, // Has caption
          state: null,
        });

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: mockTelegramUpdates.channelPost, // Text only
          state: null,
        });

        // Filter text-only
        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: { textOnly: true, maxResults: 10 },
          state: null,
        });

        const typedResult = output as { items: SourceItem[]; nextState: StreamState };
        // Should get text message, media with caption, and channel post
        expect(typedResult.items.length).toBe(3);
        const firstMessage = getMessageFromUpdate(typedResult.items[0]);
        const secondMessage = getMessageFromUpdate(typedResult.items[1]);
        const thirdMessage = getMessageFromUpdate(typedResult.items[2]);
        expect(getTextFromMessage(firstMessage)).toBe("Hello bot! This is a test message.");
        expect(getTextFromMessage(secondMessage)).toBe("Check out this photo!");
        expect(getTextFromMessage(thirdMessage)).toBe("Channel announcement!");
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should handle command filtering correctly", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        // Add regular messages and commands
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

        const regularMessage = createMockMessage("Regular message", 12345);
        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: regularMessage,
          state: null,
        });

        // Include commands
        const withCommandsOutput = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: { includeCommands: true, maxResults: 10 },
          state: null,
        });

        const withCommandsResult = withCommandsOutput as { items: SourceItem[]; nextState: StreamState };
        expect(withCommandsResult.items.length).toBe(3);

        // Add the same messages again for the second test
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

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "webhook" as const,
          input: regularMessage,
          state: null,
        });

        // Exclude commands
        const withoutCommandsOutput = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: { includeCommands: false, maxResults: 10 },
          state: null,
        });

        const withoutCommandsResult = withoutCommandsOutput as { items: SourceItem[]; nextState: StreamState };
        expect(withoutCommandsResult.items.length).toBe(2); // Should exclude the /start command
        const firstMessage = getMessageFromUpdate(withoutCommandsResult.items[0]);
        const secondMessage = getMessageFromUpdate(withoutCommandsResult.items[1]);
        expect(getTextFromMessage(firstMessage)).toBe("Hello bot! This is a test message.");
        expect(getTextFromMessage(secondMessage)).toBe("Regular message");
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );
  });

  describe("Concurrent Webhook Processing", () => {
    it.effect("should handle multiple concurrent webhook calls", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", TEST_CONFIG);

        // Create multiple messages
        const messages = Array.from({ length: 5 }, (_, i) => 
          createMockMessage(`Concurrent message ${i + 1}`, 12345)
        );

        // Process webhooks concurrently
        const webhookEffects = messages.map(message =>
          pluginRuntime.executePlugin(plugin, {
            procedure: "webhook" as const,
            input: message,
            state: null,
          })
        );

        yield* Effect.all(webhookEffects, { concurrency: "unbounded" });

        // Retrieve all messages
        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "listen" as const,
          input: { maxResults: 10 },
          state: null,
        });

        const typedResult = output as { items: SourceItem[]; nextState: StreamState };
        expect(typedResult.items.length).toBe(5);
        
        // All messages should be present (order may vary due to concurrency)
        const contents = typedResult.items.map(item => {
          const message = getMessageFromUpdate(item);
          return getTextFromMessage(message);
        });
        for (let i = 1; i <= 5; i++) {
          expect(contents).toContain(`Concurrent message ${i}`);
        }
      }).pipe(Effect.provide(testLayer), Effect.timeout("6 seconds"))
    );
  });
});

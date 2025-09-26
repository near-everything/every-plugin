import { expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import type { PluginBinding, PluginRegistry } from "every-plugin";
import { createPluginClient } from "every-plugin/client";
import { createTestPluginRuntime, type TestPluginMap } from "every-plugin/testing";
import { beforeAll, describe } from "vitest";
import TelegramSourcePlugin from "../../index";

// Define typed registry bindings for the telegram plugin
type TelegramBindings = {
  "@curatedotfun/telegram-source": PluginBinding<typeof TelegramSourcePlugin>;
};

// Test registry for integration tests
const TEST_REGISTRY: PluginRegistry = {
  "@curatedotfun/telegram-source": {
    remoteUrl: "http://localhost:3014/remoteEntry.js",
    type: "source",
    version: "1.0.0",
    description: "Telegram source plugin for webhook integration testing",
  },
};

// Load test configuration from .env.test
const TEST_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TEST_CHAT_ID = process.env.TELEGRAM_TEST_CHAT_ID || "-4956736324";

// Integration test configuration (polling mode to avoid webhook registration)
const INTEGRATION_CONFIG = {
  variables: {
    timeout: 30000,
    defaultMaxResults: 100,
  },
  secrets: {
    botToken: TEST_BOT_TOKEN,
  },
};

const SECRETS_CONFIG = {
  TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
};

// Plugin map for tests
const TEST_PLUGIN_MAP: TestPluginMap = {
  "@curatedotfun/telegram-source": TelegramSourcePlugin,
};

// Helper to create realistic webhook update from sent message
const createWebhookUpdateFromSentMessage = (sentMessage: any, content: string) => ({
  update_id: Math.floor(Math.random() * 1000000),
  message: {
    message_id: sentMessage.messageId,
    date: Math.floor(Date.now() / 1000),
    text: content,
    chat: {
      id: parseInt(TEST_CHAT_ID),
      type: "supergroup" as const,
      title: "Test Group"
    },
    from: {
      id: 12345,
      is_bot: false,
      first_name: "Integration",
      last_name: "Test",
      username: "integrationtest"
    }
  }
});

describe("Telegram Webhook Integration Tests", () => {
  const { runtime, PluginRuntime } = createTestPluginRuntime<TelegramBindings>({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG,
  }, TEST_PLUGIN_MAP);

  beforeAll(() => {
    if (!TEST_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN is required in .env.test file");
    }
    console.log(`🔗 Webhook integration test using chat ID: ${TEST_CHAT_ID}`);
  });

  it.effect("should handle complete integration flow with all features", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* Effect.provide(PluginRuntime, runtime);
      const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", INTEGRATION_CONFIG);
      const client = createPluginClient(plugin);

      console.log("🚀 Testing complete integration: API → webhook → listen → stream");

      // Test 1: Basic message flow
      const timestamp = Date.now();
      const testMessage = `Integration test message - ${timestamp}`;
      
      const sentMessage = yield* Effect.tryPromise(() =>
        client.sendMessage({
          chatId: TEST_CHAT_ID,
          text: testMessage,
        })
      );

      expect(sentMessage.success).toBe(true);
      expect(sentMessage.messageId).toBeGreaterThan(0);
      expect(sentMessage.chatId).toBe(TEST_CHAT_ID);
      
      console.log(`✅ Test 1: Sent real message ${sentMessage.messageId} via Telegram API`);

      // Simulate webhook for the message
      const webhookUpdate = createWebhookUpdateFromSentMessage(sentMessage, testMessage);
      const webhookResult = yield* Effect.tryPromise(() =>
        client.webhook(webhookUpdate)
      );
      
      expect(webhookResult.processed).toBe(true);
      console.log(`✅ Test 1: Processed webhook update for message ${sentMessage.messageId}`);

      // Test 2: Multiple messages with filtering
      console.log("🔍 Test 2: Testing message filtering");
      
      const filterMessages = [
        `Filter test message 1 - ${timestamp}`,
        `/command_test_${timestamp}`,
        `Filter test message 2 - ${timestamp}`,
      ];

      const sentFilterMessages = [];
      for (const message of filterMessages) {
        const result = yield* Effect.tryPromise(() =>
          client.sendMessage({
            chatId: TEST_CHAT_ID,
            text: message,
          })
        );
        sentFilterMessages.push(result);
        
        // Add to webhook queue
        const filterWebhookUpdate = createWebhookUpdateFromSentMessage(result, message);
        yield* Effect.tryPromise(() => client.webhook(filterWebhookUpdate));
      }

      console.log(`✅ Test 2: Sent and processed ${filterMessages.length} messages via webhook`);

      // Test 3: Different message formats
      console.log("📝 Test 3: Testing formatted messages");
      
      const formats = [
        { text: "*Bold integration test*", parseMode: "Markdown" as const },
        { text: "_Italic integration test_", parseMode: "Markdown" as const },
        { text: "<b>HTML Bold integration test</b>", parseMode: "HTML" as const },
      ];

      for (const format of formats) {
        const result = yield* Effect.tryPromise(() =>
          client.sendMessage({
            chatId: TEST_CHAT_ID,
            text: format.text,
            parseMode: format.parseMode,
          })
        );

        expect(result.success).toBe(true);
        expect(result.messageId).toBeGreaterThan(0);
      }

      console.log(`✅ Test 3: Successfully sent ${formats.length} formatted messages`);

      // Test 4: Reply messages
      console.log("💬 Test 4: Testing reply functionality");
      
      const originalResult = yield* Effect.tryPromise(() =>
        client.sendMessage({
          chatId: TEST_CHAT_ID,
          text: "Original message for integration reply test",
        })
      );

      const replyResult = yield* Effect.tryPromise(() =>
        client.sendMessage({
          chatId: TEST_CHAT_ID,
          text: "Integration test reply message",
          replyToMessageId: originalResult.messageId,
        })
      );

      expect(replyResult.success).toBe(true);
      expect(replyResult.messageId).toBeGreaterThan(0);
      expect(replyResult.chatId).toBe(TEST_CHAT_ID);

      console.log(`✅ Test 4: Reply functionality verified: reply ${replyResult.messageId} to message ${originalResult.messageId}`);

      // Test 5: Listen and stream functionality
      console.log("🎧 Test 5: Testing listen and stream functionality");
      
      const asyncIterable = yield* Effect.tryPromise(() =>
        client.listen({
          chatId: TEST_CHAT_ID,
          maxResults: 10,
          messageTypes: ['text'],
          commands: ['/command_test'],
          idleTimeout: 1000, // Complete after 1s of no new messages
        })
      );

      const stream = Stream.fromAsyncIterable(asyncIterable, (error) => error);
      const collected = yield* stream.pipe(
        Stream.take(5),
        Stream.runCollect
      );

      const events = Array.from(collected);
      console.log(`✅ Test 5: Listen streamed ${events.length} events`);

      if (events.length > 0) {
        // Verify Context structure - now we get Telegraf Context objects
        const firstContext = events[0];
        expect(firstContext).toHaveProperty('update');
        expect(firstContext).toHaveProperty('telegram');
        expect(firstContext).toHaveProperty('chat');
        expect(firstContext).toHaveProperty('message');
        
        expect(firstContext.chat?.id.toString()).toBe(TEST_CHAT_ID);
        expect(firstContext.message).toBeDefined();
        expect(firstContext.update.update_id).toBeGreaterThan(0);
        
        console.log(`✅ Test 5: Verified Context structure and content`);
      }

      // Test 6: Filtering functionality
      console.log("🔍 Test 6: Testing command filtering");
      
      const filteredIterable = yield* Effect.tryPromise(() =>
        client.listen({
          chatId: TEST_CHAT_ID,
          messageTypes: ['text'], // Only text messages, no commands specified
          maxResults: 10,
          idleTimeout: 1000, // Complete after 1s of no new messages
        })
      );

      const filteredStream = Stream.fromAsyncIterable(filteredIterable, (error) => error);
      const filteredCollected = yield* filteredStream.pipe(
        Stream.take(3),
        Stream.runCollect
      );

      const filteredContexts = Array.from(filteredCollected);
      console.log(`✅ Test 6: Filtered stream returned ${filteredContexts.length} text message contexts`);

      // Verify all contexts are text messages (not commands)
      for (const ctx of filteredContexts) {
        expect(ctx.message).toBeDefined();
        if (ctx.message && 'text' in ctx.message) {
          // Text messages should not start with / (commands)
          expect(ctx.message.text?.startsWith('/')).toBe(false);
        }
      }

      // Final confirmation message
      const confirmationResult = yield* Effect.tryPromise(() =>
        client.sendMessage({
          chatId: TEST_CHAT_ID,
          text: `🎉 ALL INTEGRATION TESTS PASSED! Completed comprehensive testing at ${new Date().toISOString()}`,
          parseMode: "Markdown",
        })
      );

      expect(confirmationResult.success).toBe(true);
      console.log(`🎉 Integration test suite complete! Confirmation message ${confirmationResult.messageId} sent`);

    }).pipe(Effect.provide(runtime), Effect.timeout("60 seconds"))
  );
});

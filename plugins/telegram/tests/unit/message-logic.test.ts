import { createLocalPluginRuntime } from "every-plugin/testing";
import type { Context } from "telegraf";
import { beforeAll, describe, expect, it } from "vitest";
import { TelegramPlugin } from "@/index";
import { createCommandUpdate, createTextUpdate } from "../fixtures/telegram-updates";
import { TEST_REGISTRY } from "../setup";

// Shared config for all tests - enables instance reuse and prevents polling conflicts
const SHARED_TEST_CONFIG = {
  variables: {
    timeout: 30000
  },
  secrets: {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
  },
};

const SECRETS_CONFIG = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN!,
};

// Plugin map for tests
const TEST_PLUGIN_MAP = {
  "@curatedotfun/telegram": TelegramPlugin,
} as const;

const TEST_CHAT_ID = "-4956736324";

describe("Telegram Message Logic Tests", () => {
  const runtime = createLocalPluginRuntime({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG,
  }, TEST_PLUGIN_MAP);

  beforeAll(() => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN is required in .env.test file");
    }
  });

  describe("Plugin Initialization", () => {
    it("should initialize plugin successfully with polling mode", async () => {
      const { initialized } = await runtime.usePlugin("@curatedotfun/telegram", SHARED_TEST_CONFIG);

      expect(initialized).toBeDefined();
      expect(initialized.plugin.id).toBe("@curatedotfun/telegram");
    }, { timeout: 10000 });
  });

  describe("Message Sending", () => {
    it("should send message successfully", async () => {
      const { client } = await runtime.usePlugin("@curatedotfun/telegram", SHARED_TEST_CONFIG);

      const testMessage = `Unit test message - ${new Date().toISOString()}`;

      const result = await client.sendMessage({
        chatId: TEST_CHAT_ID,
        text: testMessage,
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeGreaterThan(0);
      expect(result.chatId).toBe(TEST_CHAT_ID);
    }, { timeout: 10000 });

    it("should send message with formatting", async () => {
      const { client } = await runtime.usePlugin("@curatedotfun/telegram", SHARED_TEST_CONFIG);

      const result = await client.sendMessage({
        chatId: TEST_CHAT_ID,
        text: "*Bold* and _italic_ text",
        parseMode: "Markdown",
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeGreaterThan(0);
    }, { timeout: 10000 });
  });

  describe("Webhook Processing Logic", () => {
    it("should process webhook updates without registering webhook", async () => {
      const { client } = await runtime.usePlugin("@curatedotfun/telegram", SHARED_TEST_CONFIG);

      // Create test updates
      const update1 = createTextUpdate("Hello webhook!", parseInt(TEST_CHAT_ID));
      const update2 = createCommandUpdate("/start", parseInt(TEST_CHAT_ID));

      // Send webhook updates (this just adds to queue, no real webhook)
      const result1 = await client.webhook(update1);
      const result2 = await client.webhook(update2);

      expect(result1.processed).toBe(true);
      expect(result2.processed).toBe(true);
    }, { timeout: 10000 });

    it("should handle malformed webhook data gracefully", async () => {
      const { client } = await runtime.usePlugin("@curatedotfun/telegram", SHARED_TEST_CONFIG);

      // Send malformed data
      // @ts-expect-error malformed, type errors are good
      const result = await client.webhook({ malformed: "data", no_update_id: true });

      expect(result.processed).toBe(true);
    }, { timeout: 10000 });
  });

  describe("Stream Processing Logic", () => {
    it("should process queued updates and stream them", async () => {
      const { client } = await runtime.usePlugin("@curatedotfun/telegram", SHARED_TEST_CONFIG);

      // Add updates to queue via webhook handler
      const update1 = createTextUpdate("Stream test message 1", parseInt(TEST_CHAT_ID));
      const update2 = createTextUpdate("Stream test message 2", parseInt(TEST_CHAT_ID));
      const update3 = createCommandUpdate("/help", parseInt(TEST_CHAT_ID));

      await client.webhook(update1);
      await client.webhook(update2);
      await client.webhook(update3);

      // Stream the messages with timeout and logging
      const streamResult = await client.listen({
        chatId: TEST_CHAT_ID,
        maxResults: 3,
        messageTypes: ['text'],
        commands: ['/help'],
      });

      console.log("🔄 Got stream result, processing messages...");

      const contexts: Context[] = [];
      let count = 0;

      // Use Promise.race to implement timeout
      await Promise.race([
        (async () => {
          for await (const ctx of streamResult) {
            console.log(`🔍 Received message via stream: Update ${ctx.update?.update_id}`);
            if (ctx.message && 'text' in ctx.message && ctx.message.text) {
              console.log(`📝 Message text: "${ctx.message.text}"`);
            }
            contexts.push(ctx);
            if (++count >= 1) break; // Take just 1 to avoid hanging
          }
        })(),
        new Promise((resolve) => {
          setTimeout(() => {
            console.log("⏰ Stream test timed out");
            resolve(undefined);
          }, 3000);
        })
      ]);

      console.log(`✅ Stream test completed with ${contexts.length} contexts`);

      // Actual test assertions - we should get at least 1 context
      expect(contexts.length).toBeGreaterThanOrEqual(1);

      // Verify each context has the expected Telegraf Context structure
      for (const ctx of contexts) {
        expect(ctx).toHaveProperty('update');
        expect(ctx).toHaveProperty('telegram');
        expect(ctx).toHaveProperty('chat');
        expect(ctx).toHaveProperty('message');

        // Verify chat ID matches
        expect(ctx.chat?.id.toString()).toBe(TEST_CHAT_ID);

        // Verify update structure
        expect(ctx.update.update_id).toBeGreaterThan(0);
        expect(ctx.message).toBeDefined();
      }

      // Verify we can find our test messages
      const textContexts = contexts.filter(ctx =>
        ctx.message && 'text' in ctx.message &&
        (ctx.message.text?.includes("Stream test message") || ctx.message.text?.startsWith("/help"))
      );

      expect(textContexts.length).toBeGreaterThanOrEqual(1);
    }, { timeout: 15000 });

    it("should filter messages by chat ID", async () => {
      const { client } = await runtime.usePlugin("@curatedotfun/telegram", SHARED_TEST_CONFIG);

      // Send updates from different chats
      const targetUpdate = createTextUpdate("Target chat message", parseInt(TEST_CHAT_ID));
      const otherUpdate = createTextUpdate("Other chat message", 999999);

      await client.webhook(targetUpdate);
      await client.webhook(otherUpdate);

      // Filter by target chat ID with timeout
      const asyncIterable = await client.listen({
        chatId: TEST_CHAT_ID,
        maxResults: 2,
      });

      const contexts: Context[] = [];
      let count = 0;

      await Promise.race([
        (async () => {
          for await (const ctx of asyncIterable) {
            contexts.push(ctx);
            if (++count >= 1) break; // Take just 1 to avoid hanging
          }
        })(),
        new Promise((resolve) => setTimeout(resolve, 2000))
      ]);

      console.log(`✅ Chat ID filter test completed with ${contexts.length} contexts`);

      // Should only get messages from target chat
      for (const ctx of contexts) {
        expect(ctx.chat?.id.toString()).toBe(TEST_CHAT_ID);
      }
    }, { timeout: 15000 });

    it("should filter commands using messageTypes", async () => {
      const { client } = await runtime.usePlugin("@curatedotfun/telegram", SHARED_TEST_CONFIG);

      // Send mixed messages
      const regularUpdate = createTextUpdate("Regular message", parseInt(TEST_CHAT_ID));
      const commandUpdate = createCommandUpdate("/command", parseInt(TEST_CHAT_ID));

      await client.webhook(regularUpdate);
      await client.webhook(commandUpdate);

      // Listen with only text messages (excludes commands by not specifying them)
      const asyncIterable = await client.listen({
        chatId: TEST_CHAT_ID,
        messageTypes: ['text'], // Only text messages, no commands specified
        maxResults: 2,
      });

      const contexts: Context[] = [];
      let count = 0;

      await Promise.race([
        (async () => {
          for await (const ctx of asyncIterable) {
            contexts.push(ctx);
            if (++count >= 1) break; // Take just 1 to avoid hanging
          }
        })(),
        new Promise((resolve) => setTimeout(resolve, 2000))
      ]);

      console.log(`✅ Message type filter test completed with ${contexts.length} contexts`);

      // Should get contexts, verify they're text messages
      for (const ctx of contexts) {
        expect(ctx.message).toBeDefined();
        if (ctx.message && 'text' in ctx.message) {
          // Regular text messages should not start with /
          expect(ctx.message.text?.startsWith('/')).toBe(false);
        }
      }
    }, { timeout: 15000 });

    it("should handle stream completion properly", async () => {
      const { client } = await runtime.usePlugin("@curatedotfun/telegram", SHARED_TEST_CONFIG);

      // Add a single message to test stream completion
      const update = createTextUpdate("Completion test message", parseInt(TEST_CHAT_ID));
      await client.webhook(update);

      console.log("🔄 Testing stream completion...");

      const asyncIterable = await client.listen({
        chatId: TEST_CHAT_ID,
        maxResults: 1, // Only take 1 message
      });

      const events: Context[] = [];
      let count = 0;

      await Promise.race([
        (async () => {
          for await (const ctx of asyncIterable) {
            events.push(ctx);
            if (++count >= 1) break;
          }
        })(),
        new Promise((resolve) => setTimeout(resolve, 2000))
      ]);

      console.log(`✅ Stream completion test finished with ${events.length} events`);
      expect(events.length).toBe(1);

      // Verify the message content
      const ctx = events[0];
      expect(ctx.message).toBeDefined();
      if (ctx.message && 'text' in ctx.message) {
        expect(ctx.message.text).toBe("Completion test message");
      }
    }, { timeout: 10000 });
  });
});

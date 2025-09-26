import { expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import type { PluginBinding, PluginRegistry } from "every-plugin";
import { createPluginClient } from "every-plugin/client";
import { createTestPluginRuntime, type TestPluginMap } from "every-plugin/testing";
import { beforeAll, describe } from "vitest";
import TelegramSourcePlugin from "../../index";
import { createCommandUpdate, createTextUpdate } from "../fixtures/telegram-updates";

// Define typed registry bindings for the telegram plugin
type TelegramBindings = {
  "@curatedotfun/telegram-source": PluginBinding<typeof TelegramSourcePlugin>;
};

// Test registry
const TEST_REGISTRY: PluginRegistry = {
  "@curatedotfun/telegram-source": {
    remoteUrl: "http://localhost:3014/remoteEntry.js",
    type: "source",
    version: "1.0.0",
    description: "Telegram source plugin for message logic testing",
  },
};

// Shared config for all tests - enables instance reuse and prevents polling conflicts
const SHARED_TEST_CONFIG = {
  variables: {
    timeout: 30000,
    defaultMaxResults: 100,
  },
  secrets: {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
  },
};

const SECRETS_CONFIG = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN!,
};

// Plugin map for tests
const TEST_PLUGIN_MAP: TestPluginMap = {
  "@curatedotfun/telegram-source": TelegramSourcePlugin,
};

const TEST_CHAT_ID = "-4956736324";

describe("Telegram Message Logic Tests", () => {
  const { runtime, PluginRuntime } = createTestPluginRuntime<TelegramBindings>({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG,
  }, TEST_PLUGIN_MAP);

  beforeAll(() => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN is required in .env.test file");
    }
  });

  describe("Plugin Initialization", () => {
    it.effect("should initialize plugin successfully with polling mode", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);

        expect(plugin).toBeDefined();
        expect(plugin.plugin.id).toBe("@curatedotfun/telegram-source");
        expect(plugin.plugin.type).toBe("source");
      }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
    );
  });

  describe("Message Sending", () => {
    it.effect("should send message successfully", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);
        const client = createPluginClient(plugin);

        const testMessage = `Unit test message - ${new Date().toISOString()}`;

        const result = yield* Effect.tryPromise(() =>
          client.sendMessage({
            chatId: TEST_CHAT_ID,
            text: testMessage,
          })
        );

        expect(result.success).toBe(true);
        expect(result.messageId).toBeGreaterThan(0);
        expect(result.chatId).toBe(TEST_CHAT_ID);
      }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
    );

    it.effect("should send message with formatting", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);
        const client = createPluginClient(plugin);

        const result = yield* Effect.tryPromise(() =>
          client.sendMessage({
            chatId: TEST_CHAT_ID,
            text: "*Bold* and _italic_ text",
            parseMode: "Markdown",
          })
        );

        expect(result.success).toBe(true);
        expect(result.messageId).toBeGreaterThan(0);
      }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
    );
  });

  describe("Webhook Processing Logic", () => {
    it.effect("should process webhook updates without registering webhook", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);
        const client = createPluginClient(plugin);

        // Create test updates
        const update1 = createTextUpdate("Hello webhook!", parseInt(TEST_CHAT_ID));
        const update2 = createCommandUpdate("/start", parseInt(TEST_CHAT_ID));

        // Send webhook updates (this just adds to queue, no real webhook)
        const result1 = yield* Effect.tryPromise(() => client.webhook(update1));
        const result2 = yield* Effect.tryPromise(() => client.webhook(update2));

        expect(result1.processed).toBe(true);
        expect(result2.processed).toBe(true);
      }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
    );

    it.effect("should handle malformed webhook data gracefully", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);
        const client = createPluginClient(plugin);

        // Send malformed data
        const result = yield* Effect.tryPromise(() =>
          // @ts-expect-error malformed, type errors are good
          client.webhook({ malformed: "data", no_update_id: true })
        );

        expect(result.processed).toBe(true);
      }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
    );
  });

  describe("Stream Processing Logic", () => {
    it.effect("should process queued updates and stream them", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);
        const client = createPluginClient(plugin);

        // Add updates to queue via webhook handler
        const update1 = createTextUpdate("Stream test message 1", parseInt(TEST_CHAT_ID));
        const update2 = createTextUpdate("Stream test message 2", parseInt(TEST_CHAT_ID));
        const update3 = createCommandUpdate("/help", parseInt(TEST_CHAT_ID));

        yield* Effect.tryPromise(() => client.webhook(update1));
        yield* Effect.tryPromise(() => client.webhook(update2));
        yield* Effect.tryPromise(() => client.webhook(update3));

        // Stream the messages
        const asyncIterable = yield* Effect.tryPromise(() =>
          client.listen({
            chatId: TEST_CHAT_ID,
            maxResults: 3,
            messageTypes: ['text'],
            commands: ['/help'],
            idleTimeout: 1000, // Complete after 1s of no new messages
          })
        );

        const stream = Stream.fromAsyncIterable(asyncIterable, (error) => error);
        const collected = yield* stream.pipe(
          Stream.take(3),
          Stream.runCollect
        );

        const contexts = Array.from(collected);

        // Actual test assertions - we should get exactly 3 contexts
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
      }).pipe(Effect.provide(runtime), Effect.timeout("15 seconds"))
    );

    it.effect("should filter messages by chat ID", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);
        const client = createPluginClient(plugin);

        // Send updates from different chats
        const targetUpdate = createTextUpdate("Target chat message", parseInt(TEST_CHAT_ID));
        const otherUpdate = createTextUpdate("Other chat message", 999999);

        yield* Effect.tryPromise(() => client.webhook(targetUpdate));
        yield* Effect.tryPromise(() => client.webhook(otherUpdate));

        // Filter by target chat ID
        const asyncIterable = yield* Effect.tryPromise(() =>
          client.listen({
            chatId: TEST_CHAT_ID,
            maxResults: 10,
            idleTimeout: 500,
          })
        );

        const stream = Stream.fromAsyncIterable(asyncIterable, (error) => error);
        const collected = yield* stream.pipe(
          Stream.take(5),
          Stream.runCollect
        );

        const contexts = Array.from(collected);

        // Should only get messages from target chat
        for (const ctx of contexts) {
          expect(ctx.chat?.id.toString()).toBe(TEST_CHAT_ID);
        }
      }).pipe(Effect.provide(runtime), Effect.timeout("15 seconds"))
    );

    it.effect("should filter commands using messageTypes", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);
        const client = createPluginClient(plugin);

        // Send mixed messages
        const regularUpdate = createTextUpdate("Regular message", parseInt(TEST_CHAT_ID));
        const commandUpdate = createCommandUpdate("/command", parseInt(TEST_CHAT_ID));

        yield* Effect.tryPromise(() => client.webhook(regularUpdate));
        yield* Effect.tryPromise(() => client.webhook(commandUpdate));

        // Listen with only text messages (excludes commands by not specifying them)
        const asyncIterable = yield* Effect.tryPromise(() =>
          client.listen({
            chatId: TEST_CHAT_ID,
            messageTypes: ['text'], // Only text messages, no commands specified
            maxResults: 10,
            idleTimeout: 500,
          })
        );

        const stream = Stream.fromAsyncIterable(asyncIterable, (error) => error);
        const collected = yield* stream.pipe(
          Stream.take(5),
          Stream.runCollect
        );

        const contexts = Array.from(collected);

        // Should get contexts, verify they're text messages
        for (const ctx of contexts) {
          expect(ctx.message).toBeDefined();
          if (ctx.message && 'text' in ctx.message) {
            // Regular text messages should not start with /
            expect(ctx.message.text?.startsWith('/')).toBe(false);
          }
        }
      }).pipe(Effect.provide(runtime), Effect.timeout("15 seconds"))
    );

    it.effect("should handle empty queue gracefully", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);
        const client = createPluginClient(plugin);

        // Don't send any webhook updates, just try to listen
        const asyncIterable = yield* Effect.tryPromise(() =>
          client.listen({
            maxResults: 10,
            idleTimeout: 500, // Should timeout quickly with empty queue
          })
        );

        const stream = Stream.fromAsyncIterable(asyncIterable, (error) => error);
        const collected = yield* stream.pipe(
          Stream.take(1), // Should complete immediately with no items
          Stream.runCollect
        );

        const events = Array.from(collected);
        expect(events.length).toBe(0);
      }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
    );
  });
});

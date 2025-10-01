import { expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import type { PluginBinding, PluginRegistry } from "every-plugin";
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
        const { initialized } = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);

        expect(initialized).toBeDefined();
        expect(initialized.plugin.id).toBe("@curatedotfun/telegram-source");
        expect(initialized.plugin.type).toBe("source");
      }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
    );
  });

  describe("Message Sending", () => {
    it.effect("should send message successfully", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const { client } = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);

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
        const { client } = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);

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
        const { client } = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);

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
        const { client } = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);

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
        const { client } = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);

        // Add updates to queue via webhook handler
        const update1 = createTextUpdate("Stream test message 1", parseInt(TEST_CHAT_ID));
        const update2 = createTextUpdate("Stream test message 2", parseInt(TEST_CHAT_ID));
        const update3 = createCommandUpdate("/help", parseInt(TEST_CHAT_ID));

        yield* Effect.tryPromise(() => client.webhook(update1));
        yield* Effect.tryPromise(() => client.webhook(update2));
        yield* Effect.tryPromise(() => client.webhook(update3));

        // Stream the messages with timeout and logging
        const streamResult = yield* Effect.tryPromise(() =>
          client.listen({
            chatId: TEST_CHAT_ID,
            maxResults: 3,
            messageTypes: ['text'],
            commands: ['/help'],
          })
        );

        console.log("🔄 Got stream result, creating Effect stream...");
        
        const stream = Stream.fromAsyncIterable(streamResult, (error) => {
          console.error("❌ Stream error:", error);
          return error;
        });
        
        console.log("🔄 Processing stream for incoming messages...");
        
        const collected = yield* Effect.race(
          stream.pipe(
            Stream.tap((ctx) => {
              console.log(`🔍 Received message via stream: Update ${ctx.update?.update_id}`);
              return Effect.sync(() => {
                if (ctx.message && 'text' in ctx.message && ctx.message.text) {
                  console.log(`📝 Message text: "${ctx.message.text}"`);
                }
              });
            }),
            Stream.take(1), // Take just 1 to avoid hanging
            Stream.runCollect
          ),
          Effect.sleep("3 seconds").pipe(
            Effect.tap(() => Effect.sync(() => console.log("⏰ Stream test timed out"))),
            Effect.as([])
          )
        );

        const contexts = Array.from(collected);
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
      }).pipe(Effect.provide(runtime), Effect.timeout("15 seconds"))
    );

    it.effect("should filter messages by chat ID", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const { client } = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);

        // Send updates from different chats
        const targetUpdate = createTextUpdate("Target chat message", parseInt(TEST_CHAT_ID));
        const otherUpdate = createTextUpdate("Other chat message", 999999);

        yield* Effect.tryPromise(() => client.webhook(targetUpdate));
        yield* Effect.tryPromise(() => client.webhook(otherUpdate));

        // Filter by target chat ID with Effect.race timeout
        const asyncIterable = yield* Effect.tryPromise(() =>
          client.listen({
            chatId: TEST_CHAT_ID,
            maxResults: 2,
          })
        );

        const stream = Stream.fromAsyncIterable(asyncIterable, (error) => error);
        const collected = yield* Effect.race(
          stream.pipe(
            Stream.take(1), // Take just 1 to avoid hanging
            Stream.runCollect
          ),
          Effect.sleep("2 seconds").pipe(Effect.as([]))
        );

        const contexts = Array.from(collected);
        console.log(`✅ Chat ID filter test completed with ${contexts.length} contexts`);

        // Should only get messages from target chat
        for (const ctx of contexts) {
          expect(ctx.chat?.id.toString()).toBe(TEST_CHAT_ID);
        }
      }).pipe(Effect.provide(runtime), Effect.timeout("15 seconds"))
    );

    it.effect("should filter commands using messageTypes", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const { client } = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);

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
            maxResults: 2,
          })
        );

        const stream = Stream.fromAsyncIterable(asyncIterable, (error) => error);
        const collected = yield* Effect.race(
          stream.pipe(
            Stream.take(1), // Take just 1 to avoid hanging
            Stream.runCollect
          ),
          Effect.sleep("2 seconds").pipe(Effect.as([]))
        );

        const contexts = Array.from(collected);
        console.log(`✅ Message type filter test completed with ${contexts.length} contexts`);

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

    it.effect("should handle stream completion properly", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const { client } = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", SHARED_TEST_CONFIG);

        // Add a single message to test stream completion
        const update = createTextUpdate("Completion test message", parseInt(TEST_CHAT_ID));
        yield* Effect.tryPromise(() => client.webhook(update));

        console.log("🔄 Testing stream completion...");

        const asyncIterable = yield* Effect.tryPromise(() =>
          client.listen({
            chatId: TEST_CHAT_ID,
            maxResults: 1, // Only take 1 message
          })
        );

        const stream = Stream.fromAsyncIterable(asyncIterable, (error) => error);
        const collected = yield* Effect.race(
          stream.pipe(
            Stream.take(1),
            Stream.runCollect
          ),
          Effect.sleep("2 seconds").pipe(Effect.as([]))
        );

        const events = Array.from(collected);
        console.log(`✅ Stream completion test finished with ${events.length} events`);
        expect(events.length).toBe(1);
        
        // Verify the message content
        const ctx = events[0];
        expect(ctx.message).toBeDefined();
        if (ctx.message && 'text' in ctx.message) {
          expect(ctx.message.text).toBe("Completion test message");
        }
      }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
    );
  });
});

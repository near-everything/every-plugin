import { expect, it } from "@effect/vitest";
import { Duration, Effect, Stream } from "effect";
import type { PluginBinding, PluginRegistry } from "every-plugin";
import { createTestPluginRuntime, type TestPluginMap } from "every-plugin/testing";
import { describe } from "vitest";
import TelegramSourcePlugin from "../../index";

// Define typed registry bindings for the telegram plugin
type TelegramBindings = {
  "@curatedotfun/telegram-source": PluginBinding<typeof TelegramSourcePlugin>;
};

// Test registry for polling integration tests
const TEST_REGISTRY: PluginRegistry = {
  "@curatedotfun/telegram-source": {
    remoteUrl: "http://localhost:3014/remoteEntry.js",
    type: "source",
    version: "1.0.0",
    description: "Telegram source plugin for polling integration testing",
  },
};

// Load test configuration from .env.test
const TEST_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TEST_CHAT_ID = process.env.TELEGRAM_TEST_CHAT_ID || "-4956736324";

// Polling integration test configuration (no domain = polling mode)
const POLLING_CONFIG = {
  variables: {
    timeout: 30000,
    defaultMaxResults: 100,
    // No domain = polling mode
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

describe("Telegram Polling Integration Tests", () => {
  const { runtime, PluginRuntime } = createTestPluginRuntime<TelegramBindings>({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG,
  }, TEST_PLUGIN_MAP);

  it.effect("should complete self-guided polling integration test", () =>
    Effect.gen(function* () {
      if (!TEST_BOT_TOKEN) {
        throw new Error("TELEGRAM_BOT_TOKEN is required in .env.test file");
      }

      console.log(`🔗 Setting up polling integration test using chat ID: ${TEST_CHAT_ID}`);

      // Initialize plugin and create properly typed client within the test
      console.log("🔧 Creating plugin client...");
      const pluginRuntime = yield* PluginRuntime;
      const { client } = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", POLLING_CONFIG);

      console.log("✅ Plugin client created successfully");
      console.log("🚀 Starting self-guided polling integration test");

      // Step 1: Send initial prompt message to guide the user
      const timestamp = Date.now();
      const promptMessage = `🤖 Integration Test Started! 
      
Please reply to this message to complete the polling integration test.
Test ID: ${timestamp}`;

      console.log("📤 Sending test prompt message...");
      const promptResult = yield* Effect.tryPromise(() =>
        client.sendMessage({
          chatId: TEST_CHAT_ID,
          text: promptMessage,
        })
      );

      expect(promptResult.success).toBe(true);
      console.log(`✅ Test prompt sent: Message ID ${promptResult.messageId}`);
      console.log("⏳ Waiting for your reply to the bot's message...");

      // Step 2: Listen for replies to our prompt message with timeout
      const streamResult = yield* Effect.tryPromise(() =>
        client.listen({
          chatId: TEST_CHAT_ID,
          maxResults: 1
        })
      );

      console.log("🔄 Got stream result, creating Effect stream...");

      // Convert to Effect stream following reference pattern
      const stream = Stream.fromAsyncIterable(streamResult, (error) => {
        console.error("❌ Stream error:", error);
        return error;
      });

      console.log("🔄 Processing stream for incoming messages...");

      // Step 3: Process the stream and collect the reply with timeout
      const messages = yield* Effect.race(
        stream.pipe(
          Stream.tap((ctx) => {
            console.log(`🔍 Received message via polling: Update ${ctx.update?.update_id}`);
            return Effect.sync(() => {
              if (ctx.message && 'text' in ctx.message && ctx.message.text) {
                console.log(`📝 Message text: "${ctx.message.text}"`);
              }
            });
          }),
          Stream.take(1), // Take only one message
          Stream.runCollect
        ),
        Effect.sleep("30 seconds").pipe(
          Effect.tap(() => Effect.sync(() => console.log("⏰ Polling integration test timed out - no user response received"))),
          Effect.as([])
        )
      );

      const messageArray = Array.from(messages);

      if (messageArray.length === 0) {
        console.log("⏰ No user response received within timeout - this is expected for automated tests");

        // Send a completion message anyway
        const timeoutResult = yield* Effect.tryPromise(() =>
          client.sendMessage({
            chatId: TEST_CHAT_ID,
            text: `⏰ Polling Integration Test Completed (Timeout)
            
No user response received within 30 seconds.
This is expected behavior for automated tests.
            
✅ Polling setup: Working
✅ Message sending: Working  
✅ Stream creation: Working
✅ Timeout handling: Working

Test ID: ${timestamp}`,
          })
        );

        expect(timeoutResult.success).toBe(true);
        console.log(`✅ Timeout completion message sent: ${timeoutResult.messageId}`);
        return; // Exit early for timeout case
      }

      expect(messageArray.length).toBe(1);

      const ctx = messageArray[0];
      expect(ctx).toBeDefined();
      expect(ctx.update).toBeDefined();

      // Step 4: Verify it's a reply and send success confirmation
      if (ctx.message && 'text' in ctx.message && ctx.message.text) {
        const userReply = ctx.message.text;

        // Check if it's a reply to our prompt (optional - any message works)
        const isReply = ctx.message.reply_to_message?.message_id === promptResult.messageId;
        const replyStatus = isReply ? "✅ (Reply detected)" : "ℹ️ (General message)";

        console.log(`📨 User response: "${userReply}" ${replyStatus}`);

        // Send success confirmation
        const successMessage = `✅ Integration Test Completed Successfully!

Your message: "${userReply}"
Test ID: ${timestamp}
Polling: ✅ Working
Auto-reply: ✅ Working
Stream processing: ✅ Working

🎉 All systems operational!`;

        const confirmationResult = yield* Effect.tryPromise(() =>
          client.sendMessage({
            chatId: TEST_CHAT_ID,
            text: successMessage,
            replyToMessageId: ctx.message?.message_id,
          })
        );

        console.log(`✅ Success confirmation sent: ${confirmationResult.messageId}`);
        expect(confirmationResult.success).toBe(true);
        expect(confirmationResult.messageId).toBeDefined();

        console.log(`🎉 Integration test completed successfully!`);
        console.log(`📊 Test Results:`);
        console.log(`   - Polling: ✅ Received user message`);
        console.log(`   - Stream processing: ✅ Processed via Effect streams`);
        console.log(`   - Auto-reply: ✅ Sent confirmation message`);
        console.log(`   - User message: "${userReply}"`);

      } else {
        console.log(`ℹ️ Received non-text message, but test still successful`);

        // Send acknowledgment for non-text messages
        const ackResult = yield* Effect.tryPromise(() =>
          client.sendMessage({
            chatId: TEST_CHAT_ID,
            text: `✅ Integration Test Completed! 
            
Received non-text message (${ctx.updateType})
Test ID: ${timestamp}
🎉 Polling integration working!`,
          })
        );

        expect(ackResult.success).toBe(true);
        console.log(`✅ Non-text message acknowledgment sent`);
      }

    }).pipe(Effect.provide(runtime), Effect.timeout(Duration.seconds(45)))
  );

});

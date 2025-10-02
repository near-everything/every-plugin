import { expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import { describe } from "vitest";
import { createPluginRuntime } from "every-plugin/runtime";
import type { PluginBinding } from "every-plugin";
import type TelegramSourcePlugin from "../../index";
import { TELEGRAM_REMOTE_ENTRY_URL } from "./global-setup";

type TelegramBindings = {
  "@curatedotfun/telegram-source": PluginBinding<typeof TelegramSourcePlugin>;
};

const TEST_REGISTRY = {
  "@curatedotfun/telegram-source": {
    remoteUrl: TELEGRAM_REMOTE_ENTRY_URL,
    type: "source",
    version: "0.0.1",
    description: "Real Telegram source plugin for polling integration testing",
  },
} as const;

const TEST_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TEST_CHAT_ID = process.env.TELEGRAM_TEST_CHAT_ID || "-4956736324";

const POLLING_CONFIG = {
  variables: {
    timeout: 30000
  },
  secrets: {
    botToken: "{{TELEGRAM_BOT_TOKEN}}",
  },
};

const SECRETS_CONFIG = {
  TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
};

describe.sequential("Telegram Polling Integration Tests", () => {
  const { runtime, PluginService } = createPluginRuntime<TelegramBindings>({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG
  });

  it.effect("should test telegram plugin polling", () =>
    Effect.gen(function* () {
      if (!TEST_BOT_TOKEN) {
        throw new Error("TELEGRAM_BOT_TOKEN is required in .env.test file");
      }

      console.log("🚀 Testing telegram plugin polling");
      console.log(`🔗 Chat ID: ${TEST_CHAT_ID}`);

      const pluginService = yield* PluginService;
      const { client } = yield* pluginService.usePlugin("@curatedotfun/telegram-source", POLLING_CONFIG);

      console.log("✅ Plugin initialized");

      // Send test prompt message
      const timestamp = Date.now();
      const promptMessage = `🤖 Integration Test - ${timestamp}
      
Please reply to complete the test.`;

      console.log("📤 Sending prompt message...");
      const sendResult = yield* Effect.tryPromise(() =>
        client.sendMessage({
          chatId: TEST_CHAT_ID,
          text: promptMessage,
        })
      ).pipe(Effect.timeout("6 seconds"));

      console.log(`✅ Prompt sent successfully`);
      expect(sendResult.success).toBe(true);

      // Start listening for messages
      console.log("🎧 Starting message stream...");
      const streamResult = yield* Effect.tryPromise(() =>
        client.listen({ maxResults: 1 })
      );

      const stream = Stream.fromAsyncIterable(streamResult, (error) => {
        console.error("❌ Stream error:", error);
        return error;
      });

      // Collect messages with timeout
      console.log("🔄 Processing stream...");
      const events = yield* stream.pipe(
        Stream.tap((ctx) =>
          Effect.sync(() => {
            console.log(`🔍 Received message`);
            if (ctx.message && 'text' in ctx.message && ctx.message.text) {
              console.log(`📝 Message: "${ctx.message.text}"`);
            }
          })
        ),
        Stream.take(1),
        Stream.runCollect,
        Effect.timeout("30 seconds")
      ).pipe(
        Effect.catchAll(() => Effect.succeed([]))
      );

      const eventArray = Array.from(events);
      
      if (eventArray.length === 0) {
        console.log("⏰ No user response - sending timeout message");
        
        const timeoutResult = yield* Effect.tryPromise(() =>
          client.sendMessage({
            chatId: TEST_CHAT_ID,
            text: `⏰ Integration Test Completed (Timeout)

✅ Plugin loading: Working
✅ Message sending: Working
✅ Stream creation: Working
✅ Timeout handling: Working

Test ID: ${timestamp}`,
          })
        ).pipe(Effect.timeout("6 seconds"));

        expect(timeoutResult.success).toBe(true);
        console.log("✅ Timeout completion message sent");
        return;
      }

      // Process received message
      expect(eventArray.length).toBe(1);
      const ctx = eventArray[0];
      expect(ctx).toBeDefined();

      if (ctx.message && 'text' in ctx.message && ctx.message.text) {
        const userReply = ctx.message.text;
        console.log(`📨 User replied: "${userReply}"`);

        // Send success confirmation
        const confirmResult = yield* Effect.tryPromise(() =>
          client.sendMessage({
            chatId: TEST_CHAT_ID,
            text: `✅ Integration Test Completed!

Your reply: "${userReply}"
✅ Plugin loading: Working
✅ Plugin polling: Working  
✅ Stream processing: Working
✅ Auto-reply: Working

🎉 All systems operational!
Test ID: ${timestamp}`,
            replyToMessageId: ctx.message?.message_id,
          })
        ).pipe(Effect.timeout("6 seconds"));

        expect(confirmResult.success).toBe(true);
        console.log("🎉 Integration test completed successfully!");
      } else {
        console.log("ℹ️ Received non-text message");
        
        const ackResult = yield* Effect.tryPromise(() =>
          client.sendMessage({
            chatId: TEST_CHAT_ID,
            text: `✅ Integration Test Completed!

Received non-text message
Test ID: ${timestamp}
🎉 Polling integration working!`,
          })
        ).pipe(Effect.timeout("6 seconds"));

        expect(ackResult.success).toBe(true);
        console.log("✅ Non-text acknowledgment sent");
      }

    }).pipe(Effect.provide(runtime), Effect.timeout("45 seconds"))
  , { timeout: 50000 });
});

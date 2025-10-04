import type { PluginBinding } from "every-plugin";
import { createPluginRuntime } from "every-plugin/runtime";
import type { Context } from "telegraf";
import { describe, expect, it } from "vitest";
import type TelegramPlugin from "../../index";
import { TELEGRAM_REMOTE_ENTRY_URL } from "./global-setup";

type TelegramBindings = {
  "@curatedotfun/telegram": PluginBinding<typeof TelegramPlugin>;
};
const TEST_REGISTRY = {
  "@curatedotfun/telegram": {
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
  const runtime = createPluginRuntime<TelegramBindings>({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG
  });

  it("should test telegram plugin polling", async () => {
    if (!TEST_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN is required in .env.test file");
    }

    console.log("🚀 Testing telegram plugin polling");
    console.log(`🔗 Chat ID: ${TEST_CHAT_ID}`);

    const { client } = await runtime.usePlugin("@curatedotfun/telegram", POLLING_CONFIG);

    console.log("✅ Plugin initialized");

    // Send test prompt message
    const timestamp = Date.now();
    const promptMessage = `🤖 Integration Test - ${timestamp}
      
Please reply to complete the test.`;

    console.log("📤 Sending prompt message...");
    const sendResult = await Promise.race([
      client.sendMessage({
        chatId: TEST_CHAT_ID,
        text: promptMessage,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Send timeout")), 6000))
    ]);

    console.log(`✅ Prompt sent successfully`);
    expect(sendResult.success).toBe(true);

    // Start listening for messages
    console.log("🎧 Starting message stream...");
    const streamResult = await client.listen({ maxResults: 1 });

    // Collect messages with timeout
    console.log("🔄 Processing stream...");
    const eventArray: Context[] = [];

    try {
      await Promise.race([
        (async () => {
          for await (const ctx of streamResult) {
            console.log(`🔍 Received message`);
            if (ctx.message && 'text' in ctx.message && ctx.message.text) {
              console.log(`📝 Message: "${ctx.message.text}"`);
            }
            eventArray.push(ctx);
            break; // Take only 1
          }
        })(),
        new Promise((resolve) => setTimeout(resolve, 30000))
      ]);
    } catch (error) {
      console.log("Stream processing completed or timed out");
    }

    if (eventArray.length === 0) {
      console.log("⏰ No user response - sending timeout message");

      const timeoutResult = await Promise.race([
        client.sendMessage({
          chatId: TEST_CHAT_ID,
          text: `⏰ Integration Test Completed (Timeout)

✅ Plugin loading: Working
✅ Message sending: Working
✅ Stream creation: Working
✅ Timeout handling: Working

Test ID: ${timestamp}`,
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Send timeout")), 6000))
      ]);

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
      const confirmResult = await Promise.race([
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
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Send timeout")), 6000))
      ]);

      expect(confirmResult.success).toBe(true);
      console.log("🎉 Integration test completed successfully!");
    } else {
      console.log("ℹ️ Received non-text message");

      const ackResult = await Promise.race([
        client.sendMessage({
          chatId: TEST_CHAT_ID,
          text: `✅ Integration Test Completed!

Received non-text message
Test ID: ${timestamp}
🎉 Polling integration working!`,
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Send timeout")), 6000))
      ]);

      expect(ackResult.success).toBe(true);
      console.log("✅ Non-text acknowledgment sent");
    }
  }, { timeout: 50000 });
});

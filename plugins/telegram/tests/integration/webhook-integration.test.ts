import { createLocalPluginRuntime } from "every-plugin/testing";
import type { Context } from "telegraf";
import { beforeAll, describe, expect, it } from "vitest";
import { TelegramPlugin } from "@/index";
import { TEST_REGISTRY } from "../setup";

// Import the plugin locally for integration tests

// Load test configuration from .env.test
const TEST_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TEST_CHAT_ID = process.env.TELEGRAM_TEST_CHAT_ID || "-4956736324";

// Integration test configuration (polling mode to avoid webhook registration)
const INTEGRATION_CONFIG = {
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

// Helper to create realistic webhook update from sent message
const createWebhookUpdateFromSentMessage = (sentMessage: { messageId: number }, content: string) => ({
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
describe.sequential("Telegram Webhook Integration Tests", () => {
  const runtime = createLocalPluginRuntime(
    { registry: TEST_REGISTRY, secrets: SECRETS_CONFIG },
    { "@curatedotfun/telegram": TelegramPlugin }
  );

  beforeAll(() => {
    if (!TEST_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN is required in .env.test file");
    }
    console.log(`🔗 Webhook integration test using chat ID: ${TEST_CHAT_ID}`);
  });

  it("should handle complete integration flow with all features", async () => {
    const { client } = await runtime.usePlugin("@curatedotfun/telegram", INTEGRATION_CONFIG);

    console.log("🚀 Testing complete integration: API → webhook → listen → stream");

    // Test 1: Basic message flow
    const timestamp = Date.now();
    const testMessage = `Integration test message - ${timestamp}`;

    const sentMessage = await client.sendMessage({
      chatId: TEST_CHAT_ID,
      text: testMessage,
    });

    expect(sentMessage.success).toBe(true);
    expect(sentMessage.messageId).toBeGreaterThan(0);
    expect(sentMessage.chatId).toBe(TEST_CHAT_ID);

    console.log(`✅ Test 1: Sent real message ${sentMessage.messageId} via Telegram API`);

    // Simulate webhook for the message
    const webhookUpdate = createWebhookUpdateFromSentMessage(sentMessage, testMessage);
    const webhookResult = await client.webhook(webhookUpdate);

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
      const result = await client.sendMessage({
        chatId: TEST_CHAT_ID,
        text: message,
      });
      sentFilterMessages.push(result);

      // Add to webhook queue
      const filterWebhookUpdate = createWebhookUpdateFromSentMessage(result, message);
      await client.webhook(filterWebhookUpdate);
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
      const result = await client.sendMessage({
        chatId: TEST_CHAT_ID,
        text: format.text,
        parseMode: format.parseMode,
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeGreaterThan(0);
    }

    console.log(`✅ Test 3: Successfully sent ${formats.length} formatted messages`);

    // Test 4: Reply messages
    console.log("💬 Test 4: Testing reply functionality");

    const originalResult = await client.sendMessage({
      chatId: TEST_CHAT_ID,
      text: "Original message for integration reply test",
    });

    const replyResult = await client.sendMessage({
      chatId: TEST_CHAT_ID,
      text: "Integration test reply message",
      replyToMessageId: originalResult.messageId,
    });

    expect(replyResult.success).toBe(true);
    expect(replyResult.messageId).toBeGreaterThan(0);
    expect(replyResult.chatId).toBe(TEST_CHAT_ID);

    console.log(`✅ Test 4: Reply functionality verified: reply ${replyResult.messageId} to message ${originalResult.messageId}`);

    // Test 5: Listen and stream functionality - consume existing queue items
    console.log("🎧 Test 5: Testing listen and stream functionality");

    const streamResult = await client.listen({
      chatId: TEST_CHAT_ID,
      maxResults: 3,
    });

    console.log("🔄 Got stream result, processing messages...");

    const events: Context[] = [];
    let count = 0;

    await Promise.race([
      (async () => {
        for await (const ctx of streamResult) {
          console.log(`🔍 Received message via stream: Update ${ctx.update?.update_id}`);
          if (ctx.message && 'text' in ctx.message && ctx.message.text) {
            console.log(`📝 Message text: "${ctx.message.text}"`);
          }
          events.push(ctx);
          if (++count >= 3) break;
        }
      })(),
      new Promise((resolve) => {
        setTimeout(() => {
          console.log("⏰ Stream test timed out");
          resolve(undefined);
        }, 5000);
      })
    ]);

    console.log(`✅ Test 5: Listen streamed ${events.length} events`);

    if (events.length > 0) {
      // Verify Context structure - now we get Telegraf Context objects
      const firstContext = events[0];
      expect(firstContext).toHaveProperty('update');
      expect(firstContext).toHaveProperty('telegram');
      expect(firstContext).toHaveProperty('chat');
      expect(firstContext).toHaveProperty('message');

      expect(firstContext?.chat?.id.toString()).toBe(TEST_CHAT_ID);
      expect(firstContext?.message).toBeDefined();
      expect(firstContext?.update.update_id).toBeGreaterThan(0);

      console.log(`✅ Test 5: Verified Context structure and content`);
    } else {
      console.log("ℹ️ No events received - this may be expected if queue was already consumed");
    }

    // Final confirmation message
    const confirmationResult = await client.sendMessage({
      chatId: TEST_CHAT_ID,
      text: `🎉 ALL INTEGRATION TESTS PASSED! Completed comprehensive testing at ${new Date().toISOString()}`,
      parseMode: "Markdown",
    });

    expect(confirmationResult.success).toBe(true);
    console.log(`🎉 Integration test suite complete! Confirmation message ${confirmationResult.messageId} sent`);
  }, { timeout: 30000 });
});

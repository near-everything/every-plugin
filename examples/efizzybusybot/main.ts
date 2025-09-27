#!/usr/bin/env bun

import { RPCHandler } from "@orpc/server/fetch";
import { Effect, Logger, LogLevel, Stream } from "effect";
import type { PluginBinding } from "every-plugin";
import { createPluginClient, getPluginRouter } from "every-plugin/client";
import { createPluginRuntime } from "every-plugin/runtime";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import type TelegramPlugin from "../../plugins/telegram-source/src";
import { DatabaseService, DatabaseServiceLive } from "./services/db.service";
import { processMessage } from "./worker";

// Define typed registry bindings for the telegram plugin
type TelegramBindings = {
  "@curatedotfun/telegram-source": PluginBinding<typeof TelegramPlugin>;
};

// Environment configuration
const TARGET_CHAT_ID = Bun.env.TELEGRAM_CHAT_ID;
const BOT_TOKEN = Bun.env.TELEGRAM_BOT_TOKEN || "your-bot-token-here";
const WEBHOOK_DOMAIN = Bun.env.WEBHOOK_DOMAIN; // Optional - if not set, use polling mode
const WEBHOOK_TOKEN = Bun.env.WEBHOOK_TOKEN || ""; // Optional webhook secret token
const HTTP_PORT = parseInt(Bun.env.HTTP_PORT || "4000");

// Determine if we should use webhooks or polling
const useWebhooks = !!WEBHOOK_DOMAIN;

// Create plugin runtime
const { runtime, PluginRuntime } = createPluginRuntime<TelegramBindings>({
  registry: {
    "@curatedotfun/telegram-source": {
      remoteUrl: "https://elliot-braem-37--curatedotfun-telegram-source-eve-43d4b5b4e-ze.zephyrcloud.app/remoteEntry.js",
      type: "source"
    }
  },
  secrets: {
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_WEBHOOK_TOKEN: WEBHOOK_TOKEN
  }
});

// Create HTTP server with plugin router integration
const createHttpServer = (telegramPlugin) => Effect.gen(function* () {
  const db = yield* DatabaseService;

  const app = new Hono();

  // Add middleware
  app.use(honoLogger());
  app.use("/*", cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }));

  // Health check
  app.get("/", (c) => c.json({
    status: "ok",
    service: "efizzybusybot",
    timestamp: new Date().toISOString(),
    mode: useWebhooks ? "webhook" : "polling"
  }));

  // Custom endpoint to get all messages
  app.get("/messages", async (c) => {
    try {
      const limit = parseInt(c.req.query("limit") || "100");
      const messagesResult = await Effect.runPromise(
        db.getAllMessages(limit).pipe(Effect.provide(DatabaseServiceLive))
      );

      return c.json({
        success: true,
        count: messagesResult.length,
        messages: messagesResult.map(msg => ({
          id: msg.id,
          externalId: msg.externalId,
          content: msg.content,
          contentType: msg.contentType,
          authorUsername: msg.authorUsername,
          authorDisplayName: msg.authorDisplayName,
          chatId: msg.chatId,
          messageId: msg.messageId,
          chatType: msg.chatType,
          isCommand: msg.isCommand,
          isReply: msg.isReply,
          hasMedia: msg.hasMedia,
          processed: msg.processed,
          createdAt: msg.createdAt,
          ingestedAt: msg.ingestedAt,
          url: msg.url
        }))
      });
    } catch (error) {
      console.error("Error fetching messages:", error);
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }, 500);
    }
  });

  // Mount plugin router for telegram endpoints using Hono pattern
  const router = getPluginRouter(telegramPlugin);
  const handler = new RPCHandler(router);

  app.use("/telegram/*", async (c, next) => {
    const { matched, response } = await handler.handle(c.req.raw, {
      prefix: "/telegram",
      context: telegramPlugin.context,
    });

    if (matched) {
      return c.newResponse(response.body, response);
    }
    await next();
  });

  // Start HTTP server
  console.log(`🌐 Starting HTTP server on port ${HTTP_PORT}...`);
  console.log(`📡 Mode: ${useWebhooks ? 'Webhook' : 'Polling'}`);

  const server = Bun.serve({
    port: HTTP_PORT,
    fetch: app.fetch,
  });

  console.log(`✅ HTTP server running on http://localhost:${HTTP_PORT}`);
  console.log(`📊 Messages endpoint: http://localhost:${HTTP_PORT}/messages`);
  console.log(`🔗 Telegram endpoints: http://localhost:${HTTP_PORT}/telegram/*`);
  if (useWebhooks) {
    console.log(`🪝 Webhook endpoint: http://localhost:${HTTP_PORT}/telegram/webhook`);
  }

  return { server };
});

// Save stream state
const saveState = (state: { lastUpdateId: number, totalProcessed: number, chatId?: string }) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    yield* db.saveStreamState({
      lastUpdateId: state.lastUpdateId,
      totalProcessed: state.totalProcessed,
      chatId: state.chatId,
    });
  });

// Load stream state
const loadState = () =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const state = yield* db.loadStreamState();

    if (!state) return null;

    return {
      totalProcessed: state.totalProcessed,
      lastUpdateId: state.lastUpdateId,
      chatId: state.chatId,
    };
  });

// Main program
const program = Effect.gen(function* () {
  const shutdown = () => {
    console.log('\n🛑 Shutting down bot gracefully...');
    runtime.runPromise(Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      yield* pluginRuntime.shutdown();
    }).pipe(Effect.provide(runtime))).finally(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('🤖 Starting efizzybusybot with new telegram plugin...\n');

  // Initialize plugin at program root level
  const pluginRuntime = yield* PluginRuntime;
  const telegramPlugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", {
    variables: {
      timeout: 30000,
      defaultMaxResults: 100,
      ...(useWebhooks && WEBHOOK_DOMAIN && { domain: WEBHOOK_DOMAIN })
    },
    secrets: {
      botToken: "{{TELEGRAM_BOT_TOKEN}}",
      ...(useWebhooks && WEBHOOK_TOKEN && { webhookToken: "{{TELEGRAM_WEBHOOK_TOKEN}}" })
    }
  });

  // Load initial state
  const initialState = yield* loadState();

  if (initialState) {
    console.log(`📂 Resuming from saved state (${initialState.totalProcessed || 0} messages total)`);
  } else {
    console.log('📂 Starting fresh message collection');
  }

  // Start HTTP server with plugin as dependency
  const { server } = yield* createHttpServer(telegramPlugin);
  const pluginClient = createPluginClient(telegramPlugin);

  // Create reply function for worker
  const sendReply = (chatId: string, text: string, replyToMessageId?: number) =>
    Effect.tryPromise(() =>
      pluginClient.sendMessage({
        chatId,
        text,
        replyToMessageId,
      })
    ).pipe(
      Effect.map(() => void 0),
      Effect.catchAll((error) => {
        console.error(`Failed to send reply: ${error}`);
        return Effect.fail(new Error(`Reply failed: ${error}`));
      })
    );

  // Start message streaming and processing
  const asyncIterable = yield* Effect.tryPromise(() =>
    pluginClient.listen({
      // chatId: TARGET_CHAT_ID,
      // maxResults: 100,
      messageTypes: ['text', 'photo', 'document', 'video', 'voice', 'audio', 'sticker', 'location', 'contact', 'animation', 'video_note'],
      // commands: ['/start', '/help'], // Include common commands
    })
  );

  const stream = Stream.fromAsyncIterable(asyncIterable, (error) => error);

  let messageCount = 0;
  yield* stream.pipe(
    Stream.tap((ctx) =>
      Effect.gen(function* () {
        messageCount++;

        // Diagnostic logging matching test patterns
        console.log(`🔍 Received message via stream: Update ${ctx.update?.update_id}`);
        
        if (ctx.message && 'text' in ctx.message && ctx.message.text) {
          console.log(`📝 Message text: "${ctx.message.text}"`);
        }

        const username = ctx.from?.username || ctx.from?.first_name || 'unknown';
        const chatType = ctx.chat?.type || 'unknown';

        console.log(`📨 Message ${messageCount}: ${username} in ${chatType}`);

        // Process message with worker
        yield* processMessage(ctx, sendReply);

        // Save state periodically
        if (messageCount % 10 === 0) {
          yield* saveState({
            totalProcessed: messageCount,
            lastUpdateId: ctx.update.update_id,
            chatId: TARGET_CHAT_ID,
          });
        }
      })
    ),
    Stream.runDrain
  );

}).pipe(
  Effect.provide(Logger.minimumLogLevel(LogLevel.Info)),
  Effect.provide(DatabaseServiceLive),
  Effect.provide(runtime)
);

// Display configuration info
console.log('🔧 Environment Configuration:');
console.log(`🔧 TELEGRAM_BOT_TOKEN: ${BOT_TOKEN ? '✅ Set' : '❌ Missing'}`);
console.log(`🔧 WEBHOOK_DOMAIN: ${WEBHOOK_DOMAIN || '❌ Not set (using polling)'}`);
console.log(`🔧 WEBHOOK_TOKEN: ${WEBHOOK_TOKEN ? '✅ Set' : '❌ Not set'}`);
console.log(`🔧 HTTP_PORT: ${HTTP_PORT}`);
console.log(`🔧 TELEGRAM_CHAT_ID: ${TARGET_CHAT_ID || '❌ Not set (monitoring all chats)'}`);
console.log('🔧 Bot must be added to groups/channels to see messages\n');

// Run the program
await runtime.runPromise(program);

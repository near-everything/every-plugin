#!/usr/bin/env bun

import type { AnyRouter } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { Context, Effect, Layer, Logger, LogLevel, Stream } from "effect";
import { createPluginRuntime, PluginRuntime } from "every-plugin/runtime";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import type { SourceItem } from "../../plugins/telegram-source/src/schemas";
import type { NewItem } from "./schemas/database";
import { DatabaseService, DatabaseServiceLive } from "./services/db.service";

const TARGET_CHAT_ID = Bun.env.TELEGRAM_CHAT_ID;
const BOT_TOKEN = Bun.env.TELEGRAM_BOT_TOKEN || "your-bot-token-here";
const WEBHOOK_DOMAIN = Bun.env.WEBHOOK_DOMAIN; // Optional - if not set, use polling mode
const WEBHOOK_TOKEN = Bun.env.WEBHOOK_TOKEN || "your-webhook-token-here"; // Optional webhook secret token
const HTTP_PORT = parseInt(Bun.env.HTTP_PORT || "4000");

// Determine if we should use webhooks or polling
const useWebhooks = !!WEBHOOK_DOMAIN;

const runtime = createPluginRuntime({
  registry: {
    "@curatedotfun/telegram-source": {
      remoteUrl: "https://elliot-braem-9--curatedotfun-telegram-source-ever-043bf02a1-ze.zephyrcloud.app/remoteEntry.js",
      type: "source"
    }
  },
  secrets: {
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_WEBHOOK_TOKEN: WEBHOOK_TOKEN
  }
});

// TelegramPlugin service tag for dependency injection
export class TelegramPlugin extends Context.Tag("TelegramPlugin")<
  TelegramPlugin,
  any // InitializedPlugin type - using any for now to avoid complex typing
>() {}

// Layer that provides the initialized Telegram plugin
const TelegramPluginLive = Layer.effect(
  TelegramPlugin,
  Effect.gen(function* () {
    const pluginRuntime = yield* PluginRuntime;
    
    // Initialize the plugin once with the configuration
    const initializedPlugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", {
      variables: useWebhooks ? {
        domain: WEBHOOK_DOMAIN,
      } : {},
      secrets: {
        botToken: "{{TELEGRAM_BOT_TOKEN}}",
        ...(useWebhooks && WEBHOOK_TOKEN && { webhookToken: "{{TELEGRAM_WEBHOOK_TOKEN}}" })
      }
    });
    
    return initializedPlugin;
  })
);

const convertToDbItem = (item: SourceItem): NewItem => {
  return {
    externalId: item.id,
    platform: 'telegram',
    content: item.content,
    contentType: item.contentType,

    chatId: item.chatId,
    messageId: item.messageId,
    chatType: item.chatType,
    chatTitle: 'title' in item.message.chat ? item.message.chat.title : undefined,
    chatUsername: 'username' in item.message.chat ? item.message.chat.username : undefined,

    originalAuthorId: item.author?.id,
    originalAuthorUsername: item.author?.username,
    originalAuthorDisplayName: item.author?.displayName,

    isCommand: item.isCommand,
    replyToMessageId: 'reply_to_message' in item.message ? item.message.reply_to_message?.message_id : undefined,
    forwardFromUserId: 'forward_from' in item.message ? (item.message.forward_from as any)?.id?.toString() : undefined,

    createdAt: item.createdAt,
    url: item.url,
    rawData: JSON.stringify(item.raw),
  };
};

const processItemWithReply = (item: SourceItem, itemNumber: number) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const telegramPlugin = yield* TelegramPlugin;

    // Store the item directly
    const dbItem = convertToDbItem(item);
    const itemId = yield* db.insertItem(dbItem);

    if (itemId === 0) {
      console.log(`${itemNumber}. Duplicate message skipped: ${item.id}`);
      return;
    }

    // Queue commands if this is a command message
    if (item.isCommand) {
      yield* db.enqueueProcessing(itemId, "command" as any);
      console.log(`🤖 Queued command for processing: ${item.id}`);
    }

    // Check for custom commands
    if (item.content.toLowerCase().includes("!submit")) {
      yield* db.enqueueProcessing(itemId, "submit" as any);
      console.log(`🤖 Queued submit command for processing: ${item.id}`);
    }

    const messageId = item.id;
    const timestamp = item.createdAt;
    const username = item.author?.username || item.author?.displayName || 'unknown';
    const chatTitle = dbItem.chatTitle ? ` in "${dbItem.chatTitle}"` : '';
    const commandIndicator = item.isCommand ? ' 🤖' : '';

    console.log(`${itemNumber}. @${username} (${messageId}) - ${timestamp}${chatTitle}${commandIndicator}`);

    // Send immediate reply using the plugin's sendMessage procedure
    if (item.chatId) {
      const pluginRuntime = yield* PluginRuntime;
      const replyText = `Hello @${username}! I received your message: "${item.content.substring(0, 50)}${item.content.length > 50 ? '...' : ''}"`;

      yield* pluginRuntime.executePlugin(
        telegramPlugin,
        {
          procedure: "sendMessage",
          input: {
            chatId: item.chatId,
            text: replyText,
            replyToMessageId: item.messageId,
          }
        }
      ).pipe(
        Effect.catchAll((error) => {
          console.error(`Failed to send reply: ${error}`);
          return Effect.void;
        })
      );
    }
  });

const saveState = (state: any) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    yield* db.saveStreamState({
      phase: 'monitoring',
      lastUpdateId: state.lastUpdateId,
      totalProcessed: state.totalProcessed,
      nextPollMs: state.nextPollMs,
      chatId: state.chatId,
    });
  });

const loadState = () =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const state = yield* db.loadStreamState();

    if (!state) return null;

    return {
      totalProcessed: state.totalProcessed,
      lastUpdateId: state.lastUpdateId,
      nextPollMs: state.nextPollMs,
      chatId: state.chatId,
    };
  });

// Create HTTP server with plugin router integration
const createHttpServer: Effect.Effect<any, Error, DatabaseService | PluginRuntime | TelegramPlugin> =
  Effect.gen(function* () {
    const telegramPlugin = yield* TelegramPlugin;

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
      timestamp: new Date().toISOString()
    }));

    const router = telegramPlugin.plugin.createRouter();
    const handler = new RPCHandler(router as AnyRouter);

    // Expose plugin procedures via HTTP (including webhook)
    app.use("/telegram/*", async (c, next) => {
      const { matched, response } = await handler.handle(c.req.raw, {
        prefix: "/telegram",
        context: { state: null } // Provide context for streaming procedures
      });

      if (matched) {
        return c.newResponse(response.body, response);
      }
      await next();
    });

    // Start HTTP server
    console.log(`🌐 Starting HTTP API server on port ${HTTP_PORT}...`);

    const server = Bun.serve({
      port: HTTP_PORT,
      fetch: app.fetch,
    });

    console.log(`✅ HTTP API server running on http://localhost:${HTTP_PORT}`);
    console.log(`📡 Plugin procedures available at: http://localhost:${HTTP_PORT}/telegram/*`);
    console.log(`🔗 Telegram webhook endpoint: http://localhost:${HTTP_PORT}/telegram/webhook`);

    return server;
  });

const program = Effect.gen(function* () {
  const shutdown = () => {
    console.log('\n🛑 Shutting down Telegram bot gracefully...');
    runtime.runPromise(Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      yield* pluginRuntime.shutdown();
    }).pipe(Effect.provide(runtime))).finally(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('🤖 Starting Telegram bot with webhook and immediate replies...\n');

  const initialState = yield* loadState();

  if (initialState) {
    console.log(`📂 Resuming from saved state (${initialState.totalProcessed || 0} messages total)`);
  } else {
    console.log('📂 Starting fresh message collection');
  }

  const pluginRuntime = yield* PluginRuntime;
  const telegramPlugin = yield* TelegramPlugin;

  // Start HTTP server
  yield* createHttpServer;

  const stream = yield* pluginRuntime.streamPlugin(
    telegramPlugin,
    {
      procedure: "listen",
      input: {
        chatId: TARGET_CHAT_ID,
        maxResults: 100,
        budgetMs: 30000,
        includeCommands: true,
        textOnly: false,
      },
      state: initialState,
    },
    {
      maxInvocations: 1000,
      onStateChange: (newState: any, items: SourceItem[]) =>
        Effect.gen(function* () {
          if (items.length > 0) {
            const chatInfo = newState.chatId ? ` (chat: ${newState.chatId})` : '';
            console.log(`📥 Processing ${items.length} messages (${newState.totalProcessed || 0} total)${chatInfo}`);
          } else {
            console.log('⏰ No new messages, monitoring for updates...');
          }

          yield* saveState(newState);
        }).pipe(Effect.provide(DatabaseServiceLive))
    }
  );

  let itemCount = 0;
  yield* stream.pipe(
    Stream.tap((item: SourceItem) =>
      Effect.gen(function* () {
        itemCount++;
        yield* processItemWithReply(item, itemCount);
      })
    ),
    Stream.runDrain
  );

}).pipe(
  Effect.provide(Logger.minimumLogLevel(LogLevel.Info)),
  Effect.provide(TelegramPluginLive),
  Effect.provide(DatabaseServiceLive),
  Effect.provide(runtime)
);

console.log('🔧 Make sure to set these environment variables:');
console.log('🔧 TELEGRAM_BOT_TOKEN - Your bot token from @BotFather');
console.log('🔧 WEBHOOK_DOMAIN - Your public domain (e.g., "yourdomain.com")');
console.log('🔧 HTTP_PORT - Port for HTTP server (default: 4000)');
console.log('🔧 WEBHOOK_SECRET_TOKEN - Optional: secret token for webhook security');
console.log('🔧 TELEGRAM_CHAT_ID - Optional: specific chat to monitor');
console.log('🔧 Bot must be added to groups/channels to see messages\n');

await runtime.runPromise(program);

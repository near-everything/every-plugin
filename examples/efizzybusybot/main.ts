#!/usr/bin/env bun

import { RPCHandler } from "@orpc/server/fetch";
import type { PluginBinding, PluginOf } from "every-plugin";
import { Effect, Layer, Logger, LogLevel, Stream } from "every-plugin/effect";
import { createPluginRuntime, type PluginResult } from "every-plugin/runtime";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import type TelegramPlugin from "../../plugins/telegram-source/src";
import { DatabaseService, DatabaseServiceLive } from "./services/db.service";
import { EmbeddingsServiceLive } from "./services/embeddings.service";
import { NearAiServiceLive } from "./services/nearai.service";
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
      remoteUrl: "https://elliot-braem-61-curatedotfun-telegram-source-ever-42ebc08c0-ze.zephyrcloud.app/remoteEntry.js",
      type: "source"
    }
  },
  secrets: {
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_WEBHOOK_TOKEN: WEBHOOK_TOKEN
  }
});

// Create HTTP server with plugin router integration
const createHttpServer = (plugin: PluginResult<PluginOf<TelegramBindings["@curatedotfun/telegram-source"]>>) => Effect.gen(function* () {
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
        db.getAllMessages(limit)
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

  const { initialized, router } = plugin;

  const handler = new RPCHandler(router);

  app.use("/telegram/*", async (c, next) => {
    const { matched, response } = await handler.handle(c.req.raw, {
      prefix: "/telegram",
      context: initialized.context,
    });

    if (matched) {
      return c.newResponse(response.body, response);
    }
    await next();
  });

  const server = Bun.serve({
    port: HTTP_PORT,
    fetch: app.fetch,
  });

  console.log(`✅ HTTP server running on http://localhost:${HTTP_PORT} (${useWebhooks ? 'webhook' : 'polling'} mode)`);

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

console.log('🤖 Starting efizzybusybot...');

const program = Effect.gen(function* () {
  const pluginRuntime = yield* PluginRuntime;
  const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/telegram-source", {
    variables: {
      timeout: 30000,
      ...(useWebhooks && WEBHOOK_DOMAIN && { domain: WEBHOOK_DOMAIN })
    },
    secrets: {
      botToken: "{{TELEGRAM_BOT_TOKEN}}",
      ...(useWebhooks && WEBHOOK_TOKEN && { webhookToken: "{{TELEGRAM_WEBHOOK_TOKEN}}" })
    }
  });

  const shutdown = () => {
    console.log('Shutting down...');
    runtime.runPromise(
      Effect.andThen(PluginRuntime, (pluginRuntime) => pluginRuntime.shutdown()).pipe(
        Effect.provide(runtime)
      )
    ).finally(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const initialState = yield* loadState();

  if (initialState) {
    console.log(`Resuming from saved state: ${initialState.totalProcessed || 0} messages processed`);
  }

  // Start HTTP server with plugin as dependency
  const { server } = yield* createHttpServer(plugin);
  const { client } = plugin;

  const asyncIterable = yield* Effect.tryPromise(() =>
    client.listen({
      messageTypes: ['text'],
    })
  );

  const stream = Stream.fromAsyncIterable(asyncIterable, (error) => error);

  let messageCount = 0;
  yield* stream.pipe(
    Stream.tap((ctx) =>
      Effect.gen(function* () {
        messageCount++;

        yield* processMessage(ctx).pipe(
          Effect.catchAll((error) => {
            console.error(`Failed to process message ${ctx.message?.message_id || 'unknown'} from ${ctx.from?.username || 'unknown'}:`, error);
            return Effect.void; // Continue stream despite error
          })
        );

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

});

// Run the main program with all services
await Effect.runPromise(
  program.pipe(
    Effect.provide(
      NearAiServiceLive.pipe(
        Layer.provide(DatabaseServiceLive),
        Layer.provide(EmbeddingsServiceLive),
        Layer.merge(DatabaseServiceLive),
        Layer.merge(EmbeddingsServiceLive),
        Layer.merge(Logger.minimumLogLevel(LogLevel.Info))
      )
    ),
    Effect.provide(runtime)
  )
);

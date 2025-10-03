#!/usr/bin/env bun

import { RPCHandler } from "@orpc/server/fetch";
import type { PluginBinding } from "every-plugin";
import { Effect, Layer, Logger, LogLevel, Stream } from "every-plugin/effect";
import { createPluginRuntime, type EveryPlugin } from "every-plugin/runtime";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import type TelegramPlugin from "../../plugins/telegram-source/src";
import { DatabaseService } from "./services/db.service";
import { EmbeddingsService } from "./services/embeddings.service";
import { EntityExtractionService } from "./services/entity-extraction.service";
import { KnowledgeGraphService } from "./services/knowledge-graph.service";
import { LoggerService } from "./services/logger.service";
import { NearAiService } from "./services/nearai.service";
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
const runtime = createPluginRuntime<TelegramBindings>({
  registry: {
    "@curatedotfun/telegram-source": {
      remoteUrl: "https://elliot-braem-64-curatedotfun-telegram-source-ever-d4a8166e2-ze.zephyrcloud.app/remoteEntry.js",
      type: "source"
    }
  },
  secrets: {
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_WEBHOOK_TOKEN: WEBHOOK_TOKEN
  }
});

// Create HTTP server with plugin router integration
const createHttpServer = (plugin: EveryPlugin.Infer<typeof runtime, "@curatedotfun/telegram-source">) => Effect.gen(function* () {
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

  yield* Effect.logInfo("✅ HTTP server running").pipe(
    Effect.annotateLogs({
      port: HTTP_PORT,
      mode: useWebhooks ? 'webhook' : 'polling'
    })
  );

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

const program = Effect.gen(function* () {
  yield* Effect.logInfo("🤖 Starting efizzybusybot...");
  const plugin = yield* Effect.promise(() => runtime.usePlugin("@curatedotfun/telegram-source", {
    variables: {
      timeout: 30000,
      ...(useWebhooks && WEBHOOK_DOMAIN && { domain: WEBHOOK_DOMAIN })
    },
    secrets: {
      botToken: "{{TELEGRAM_BOT_TOKEN}}",
      ...(useWebhooks && WEBHOOK_TOKEN && { webhookToken: "{{TELEGRAM_WEBHOOK_TOKEN}}" })
    }
  }));

  const shutdown = () => {
    Effect.runPromise(Effect.logInfo("Shutting down..."));
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const initialState = yield* loadState();

  if (initialState) {
    yield* Effect.logInfo("Resuming from saved state").pipe(
      Effect.annotateLogs({ messagesProcessed: initialState.totalProcessed || 0 })
    );
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
          Effect.catchAll((error) =>
            Effect.logError("Failed to process message").pipe(
              Effect.annotateLogs({
                messageId: ctx.message?.message_id || 'unknown',
                username: ctx.from?.username || 'unknown',
                error: error instanceof Error ? error.message : String(error)
              }),
              Effect.as(Effect.void)
            )
          )
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

const MainLayer = Layer.mergeAll(
  DatabaseService.Default,
  EmbeddingsService.Default,
  LoggerService.Default
);

const DependentLayer = Layer.mergeAll(
  EntityExtractionService.Default,
  KnowledgeGraphService.Default,
  NearAiService.Default
).pipe(Layer.provide(MainLayer));

const AppLayer = Layer.merge(MainLayer, DependentLayer);

await Effect.runPromise(
  program.pipe(
    Effect.provide(AppLayer),
    Effect.provide(Logger.minimumLogLevel(LogLevel.Info))
  )
);

#!/usr/bin/env bun

import { RPCHandler } from "@orpc/server/fetch";
import { Effect, Layer, Logger, LogLevel, Stream } from "every-plugin/effect";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { router } from "./routers";
import { plugins } from "./runtime";
import { DatabaseService } from "./services/db.service";
import { EmbeddingsService } from "./services/embeddings.service";
import { LoggerService } from "./services/logger.service";
import { NearAiService } from "./services/nearai.service";
import { processMessage } from "./worker";

const TARGET_CHAT_ID = Bun.env.TELEGRAM_CHAT_ID;
const HTTP_PORT = parseInt(Bun.env.HTTP_PORT || "4000");

const createHttpServer = () =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      const app = new Hono();

      app.use(honoLogger());
      app.use("/*", cors({
        origin: "*",
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      }));

      const handler = new RPCHandler(router);
      app.use('/rpc/*', async (c, next) => {
        const { matched, response } = await handler.handle(c.req.raw, {
          prefix: '/rpc',
          context: {}
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

      return server;
    }),
    (server) => Effect.sync(() => server.stop())
  );

const createAndProcessTelegramMessages = () =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const initialState = yield* db.loadStreamState();

    if (initialState) {
      yield* Effect.logInfo("Resuming from saved state").pipe(
        Effect.annotateLogs({ messagesProcessed: initialState.totalProcessed || 0 })
      );
    }

    const { client } = plugins.telegram;
     const messageStream = yield* Effect.promise(() => 
      client.listen({ messageTypes: ['text'] })
    );

    let messageCount = 0;

    yield* Stream.fromAsyncIterable(messageStream, (error) => error).pipe(
      Stream.tap((ctx) =>
        Effect.gen(function* () {
          messageCount++;
          yield* processMessage(ctx);
        })
      ),
      Stream.tap((ctx) =>
        Effect.gen(function* () {
          if (messageCount % 10 === 0) {
            yield* db.saveStreamState({
              lastUpdateId: ctx.update.update_id,
              totalProcessed: messageCount,
              chatId: TARGET_CHAT_ID,
            });
          }
        })
      ),
      Stream.catchAll((error) =>
        Stream.fromEffect(
          Effect.logError("Failed to process message").pipe(
            Effect.annotateLogs({
              error: error instanceof Error ? error.message : String(error)
            })
          ).pipe(Effect.ignore)
        )
      ),
      Stream.runDrain
    );
  });

const program = Effect.gen(function* () {
  yield* Effect.logInfo("🤖 Starting efizzybusybot...");

  yield* createHttpServer();

  yield* Effect.logInfo("✅ HTTP server running").pipe(
    Effect.annotateLogs({ port: HTTP_PORT })
  );

  yield* createAndProcessTelegramMessages();
});

const AppLayer = Layer.mergeAll(
  DatabaseService.Default,
  EmbeddingsService.Default,
  LoggerService.Default,
  NearAiService.Default
);

await Effect.runPromise(
  program.pipe(
    Effect.provide(AppLayer),
    Effect.provide(Logger.minimumLogLevel(LogLevel.Info)),
    Effect.scoped
  )
);

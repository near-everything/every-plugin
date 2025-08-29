import { RPCHandler } from '@orpc/server/fetch';
import { Context, Effect, Layer } from 'effect';
import { Hono } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { AppConfig } from '../config';
import { createContext } from '../lib/context';
import { generateOpenAPISpec } from '../lib/openapi';
import { appRouter } from '../routers';
import { AuthService } from './auth.service';

export interface HttpServerServiceData {
  readonly app: Hono;
  readonly start: () => Effect.Effect<void>;
  readonly stop: () => Effect.Effect<void>;
}

export class HttpServerService extends Context.Tag("HttpServerService")<
  HttpServerService,
  HttpServerServiceData
>() { }

export const HttpServerServiceLive = Layer.scoped(
  HttpServerService,
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const authService = yield* AuthService;

    const app = new Hono();

    app.use('*', logger());

    // CORS middleware
    app.use('*', cors({
      origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:4000'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'Cookie'],
      credentials: true,
    }));

    // Better Auth routes
    app.on(['POST', 'GET'], '/api/auth/**', (c) => authService.auth.handler(c.req.raw));

    // Rate limiting middleware
    app.use('*', rateLimiter({
      windowMs: 15 * 60 * 1000, // 15 mins
      limit: 100,
      keyGenerator: (c: any) => {
        const user = c.var.user;
        return user?.id || c.req.header('x-forwarded-for') || 'anonymous';
      }
    }));

    // oRPC handler with simple context
    const rpcHandler = new RPCHandler(appRouter);
    app.use("/rpc/*", async (c, next) => {
      const context = await createContext({ context: c });

      const { matched, response } = await rpcHandler.handle(c.req.raw, {
        prefix: "/rpc",
        context: context,
      });

      if (matched) {
        return c.newResponse(response.body, response);
      }
      await next();
    });

    // Health check endpoint
    app.get("/", (c) => {
      return c.text("OK");
    });

    // OpenAPI spec endpoint
    app.get("/spec.json", async (c) => {
      try {
        const spec = await generateOpenAPISpec();
        return c.json(spec);
      } catch (error) {
        console.error('Failed to generate OpenAPI spec:', error);
        return c.json({ error: 'Failed to generate OpenAPI specification' }, 500);
      }
    });

    let server: any = null;

    const start = () => Effect.gen(function* () {
      yield* Effect.log(`Starting HTTP server on port ${config.port}`);

      server = Bun.serve({
        port: config.port,
        fetch: app.fetch,
      });

      yield* Effect.log(`HTTP server started on port ${config.port}`);
    });

    const stop = () => Effect.gen(function* () {
      if (server) {
        yield* Effect.log('Stopping HTTP server...');
        server.stop();
        yield* Effect.log('HTTP server stopped');
      }
    });

    // Register cleanup
    yield* Effect.addFinalizer(() => stop());

    return { app, start, stop };
  })
);

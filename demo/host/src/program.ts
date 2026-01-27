import { createServer, type IncomingHttpHeaders } from "node:http";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Effect, ManagedRuntime } from "every-plugin/effect";
import { formatORPCError } from "every-plugin/errors";
import { onError } from "every-plugin/orpc";
import { type Context, Hono } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { FullServerLive } from "./layers";
import { type Auth, AuthService } from "./services/auth";
import { type BootstrapConfig, ConfigService, type RuntimeConfig, setBootstrapConfig } from "./services/config";
import { createRequestContext } from "./services/context";
import type { Database } from "./services/database";
import { closeDatabase, DatabaseService } from "./services/database";
import { loadRouterModule, type RouterModule } from "./services/federation.server";
import { type PluginResult, PluginsService } from "./services/plugins";
import { createRouter } from "./services/router";
import { logger } from "./utils/logger";

function nodeHeadersToHeaders(nodeHeaders: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value) {
      if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      } else {
        headers.set(key, value);
      }
    }
  }
  return headers;
}

async function proxyRequest(req: Request, targetBase: string, rewriteCookies = false): Promise<Response> {
  const url = new URL(req.url);
  const targetUrl = `${targetBase}${url.pathname}${url.search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.set("accept-encoding", "identity");

  if (rewriteCookies) {
    const cookieHeader = headers.get("cookie");
    if (cookieHeader) {
      const rewrittenCookies = cookieHeader.replace(
        /\bbetter-auth\./g,
        "__Secure-better-auth."
      );
      headers.set("cookie", rewrittenCookies);
    }
  }

  const proxyReq = new Request(targetUrl, {
    method: req.method,
    headers,
    body: req.body,
    duplex: "half",
  } as RequestInit);

  const response = await fetch(proxyReq);

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  if (rewriteCookies) {
    const setCookieHeader = response.headers.get("set-cookie");
    if (setCookieHeader) {
      responseHeaders.delete("set-cookie");
      const cookies = setCookieHeader.split(/,(?=\s*(?:__Secure-|__Host-)?\w+=)/);
      for (const cookie of cookies) {
        const rewritten = cookie
          .replace(/^(__Secure-|__Host-)/i, "")
          .replace(/;\s*Domain=[^;]*/gi, "")
          .replace(/;\s*Secure/gi, "");
        responseHeaders.append("set-cookie", rewritten);
      }
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

function setupApiRoutes(
  app: Hono,
  config: RuntimeConfig,
  plugins: PluginResult,
  auth: Auth,
  db: Database
) {
  const isProxyMode = !!config.api.proxy;

  if (isProxyMode) {
    const proxyTarget = config.api.proxy!;
    logger.info(`[API] Proxy mode enabled → ${proxyTarget}`);

    app.all("/api/*", async (c: Context) => {
      const response = await proxyRequest(c.req.raw, proxyTarget, true);
      return response;
    });

    return;
  }

  const router = createRouter(plugins);

  const rpcHandler = new RPCHandler(router, {
    plugins: [new BatchHandlerPlugin()],
    interceptors: [onError((error: unknown) => formatORPCError(error))],
  });

  const apiHandler = new OpenAPIHandler(router, {
    plugins: [
      new OpenAPIReferencePlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
        specGenerateOptions: {
          info: {
            title: config.title,
            version: "1.0.0",
          },
          servers: [{ url: `${config.hostUrl}/api` }],
        },
      }),
    ],
    interceptors: [onError((error: unknown) => formatORPCError(error))],
  });

  app.on(["POST", "GET"], "/api/auth/*", (c: Context) => auth.handler(c.req.raw));

  app.all("/api/rpc/*", async (c: Context) => {
    const req = c.req.raw;
    const context = await createRequestContext(req, auth, db);

    const result = await rpcHandler.handle(req, {
      prefix: "/api/rpc",
      context,
    });

    return result.response ? c.newResponse(result.response.body, result.response) : c.text("Not Found", 404);
  });

  app.all("/api/*", async (c: Context) => {
    const req = c.req.raw;
    const context = await createRequestContext(req, auth, db);

    const result = await apiHandler.handle(req, {
      prefix: "/api",
      context,
    });

    return result.response ? c.newResponse(result.response.body, result.response) : c.text("Not Found", 404);
  });
}

export const createStartServer = (onReady?: () => void) => Effect.gen(function* () {
  const port = Number(process.env.PORT) || 3000;
  const isDev = process.env.NODE_ENV !== "production";

  const config = yield* ConfigService;
  const db = yield* DatabaseService;
  const auth = yield* AuthService;
  const plugins = yield* PluginsService;

  const app = new Hono();

  app.use(
    "/*",
    cors({
      origin: process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) ?? [
        config.hostUrl,
        config.ui.url,
      ],
      credentials: true,
    })
  );

  if (!isDev) {
    app.use("/*", async (c, next) => {
      const accept = c.req.header("accept") || "";
      if (accept.includes("text/html")) {
        return next();
      }
      return compress()(c, next);
    });
  }

  app.get("/health", (c: Context) => c.text("OK"));

  setupApiRoutes(app, config, plugins, auth, db);

  logger.info(`[Config] Host URL: ${config.hostUrl}`);
  logger.info(`[Config] UI source: ${config.ui.source} → ${config.ui.url}`);
  logger.info(`[Config] API source: ${config.api.source} → ${config.api.url}`);
  if (config.api.proxy) {
    logger.info(`[Config] API proxy: ${config.api.proxy}`);
  }

  let ssrRouterModule: RouterModule | null = null;

  app.get("*", async (c: Context) => {
    if (!ssrRouterModule) {
      return c.html(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>Loading...</title>
            <meta http-equiv="refresh" content="2" />
            <style>
              body { font-family: system-ui; padding: 2rem; background: #1c1c1e; color: #fafafa; text-align: center; }
            </style>
          </head>
          <body>
            <h1>⏳ SSR Loading...</h1>
            <p>The UI module is still loading. This page will refresh automatically.</p>
          </body>
        </html>
      `, 503);
    }

    try {
      const { env, account, title, hostUrl } = config;
      const assetsUrl = config.ui.url;
      const result = await ssrRouterModule.renderToStream(c.req.raw, {
        assetsUrl,
        runtimeConfig: { env, account, title, hostUrl, assetsUrl, apiBase: "/api", rpcBase: "/api/rpc" },
      });
      return new Response(result.stream, {
        status: result.statusCode,
        headers: result.headers,
      });
    } catch (error) {
      logger.error("[SSR] Streaming error:", error);
      return c.html(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>Server Error</title>
            <style>
              body { font-family: system-ui; padding: 2rem; background: #1c1c1e; color: #fafafa; }
              pre { background: #2d2d2d; padding: 1rem; border-radius: 8px; overflow-x: auto; }
            </style>
          </head>
          <body>
            <h1>Server Error</h1>
            <p>An error occurred during server-side rendering.</p>
            <pre>${error instanceof Error ? error.stack : String(error)}</pre>
          </body>
        </html>
      `, 500);
    }
  });

  if (!isDev) {
    app.use("/static/*", serveStatic({ root: "./dist" }));
    app.use("/favicon.ico", serveStatic({ root: "./dist" }));
    app.use("/icon.svg", serveStatic({ root: "./dist" }));
    app.use("/manifest.json", serveStatic({ root: "./dist" }));
    app.use("/robots.txt", serveStatic({ root: "./dist" }));
  }

  const startHttpServer = () => {
    if (isDev) {
      const server = createServer(async (req, res) => {
        const url = req.url || "/";
        const fetchReq = new Request(`http://localhost:${port}${url}`, {
          method: req.method,
          headers: nodeHeadersToHeaders(req.headers),
          body: req.method !== "GET" && req.method !== "HEAD" ? req : undefined,
          duplex: "half",
        } as RequestInit);

        try {
          const response = await app.fetch(fetchReq);
          res.statusCode = response.status;
          response.headers.forEach((value: string, key: string) => {
            res.setHeader(key, value);
          });

          if (response.body) {
            const reader = response.body.getReader();
            const pump = async () => {
              const { done, value } = await reader.read();
              if (done) {
                res.end();
                return;
              }
              res.write(value);
              await pump();
            };
            await pump();
          } else {
            const body = await response.arrayBuffer();
            res.end(Buffer.from(body));
          }
        } catch (err) {
          logger.error("[Server] Error handling request:", err);
          res.statusCode = 500;
          res.end("Internal Server Error");
        }
      });

      server.listen(port, () => {
        logger.info(`Host dev server running at http://localhost:${port}`);
        logger.info(`  http://localhost:${port}/api     → REST API (OpenAPI docs)`);
        logger.info(`  http://localhost:${port}/api/rpc → RPC endpoint`);
        onReady?.();
      });
    } else {
      const hostname = process.env.HOST || "0.0.0.0";
      serve({ fetch: app.fetch, port, hostname }, (info: { port: number }) => {
        logger.info(`Host production server running at http://${hostname}:${info.port}`);
        logger.info(`  http://${hostname}:${info.port}/api     → REST API (OpenAPI docs)`);
        logger.info(`  http://${hostname}:${info.port}/api/rpc → RPC endpoint`);
        onReady?.();
      });
    }
  };

  startHttpServer();

  yield* Effect.fork(
    Effect.gen(function* () {
      const ssrUrl = config.ui.ssrUrl ?? config.ui.url;
      logger.info(`[SSR] Loading Router module from ${ssrUrl}...`);

      const routerModuleResult = yield* loadRouterModule(config).pipe(Effect.either);

      if (routerModuleResult._tag === "Left") {
        logger.error("[SSR] Failed to load Router module:", routerModuleResult.left);
        logger.warn("[SSR] Server running in API-only mode, SSR disabled");
        return;
      }

      ssrRouterModule = routerModuleResult.right;
      logger.info("[SSR] Router module loaded successfully, SSR routes active");
    })
  );

  yield* Effect.never;
});

export const startServer = createStartServer();

export const ServerLive = FullServerLive;

export interface ServerHandle {
  ready: Promise<void>;
  shutdown: () => Promise<void>;
}

export const runServer = (bootstrap?: BootstrapConfig): ServerHandle => {
  if (bootstrap) {
    setBootstrapConfig(bootstrap);
  }

  let resolveReady: () => void;
  let rejectReady: (err: unknown) => void;

  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const runtime = ManagedRuntime.make(ServerLive);

  const shutdown = async () => {
    console.log("[Server] Shutting down...");
    closeDatabase();
    await runtime.dispose();
    console.log("[Server] Shutdown complete");
  };

  const serverEffect = createStartServer(() => resolveReady());

  runtime.runPromise(serverEffect).catch((err) => {
    console.error("Failed to start server:", err);
    rejectReady(err);
  });

  return { ready, shutdown };
};

export const runServerBlocking = async () => {
  const handle = runServer();

  process.on("SIGINT", () => void handle.shutdown().then(() => process.exit(0)));
  process.on("SIGTERM", () => void handle.shutdown().then(() => process.exit(0)));

  try {
    await handle.ready;
    await new Promise(() => { });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

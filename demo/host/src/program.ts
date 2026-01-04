import { readFile } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createRsbuild, logger } from "@rsbuild/core";
import { Effect, ManagedRuntime } from "effect";
import { formatORPCError } from "every-plugin/errors";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import rsbuildConfig from "../rsbuild.config";
import { FullServerLive } from "./layers";
import { AuthService, type Auth } from "./services/auth";
import { ConfigService, type RuntimeConfig } from "./services/config";
import { createRequestContext } from "./services/context";
import type { Database } from "./services/database";
import { DatabaseService } from "./services/database";
import { loadRouterModule, type RouterModule } from "./services/federation.server";
import { injectHeadAndConfig, injectRuntimeConfig, renderHeadToString } from "./services/html";
import { type PluginResult, PluginsService } from "./services/plugins";
import { createRouter } from "./services/router";

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

async function proxyRequest(req: Request, targetBase: string): Promise<Response> {
  const url = new URL(req.url);
  const targetUrl = `${targetBase}${url.pathname}${url.search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");

  const proxyReq = new Request(targetUrl, {
    method: req.method,
    headers,
    body: req.body,
    duplex: "half",
  } as RequestInit);

  return fetch(proxyReq);
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

    app.all("/api/*", async (c) => {
      const response = await proxyRequest(c.req.raw, proxyTarget);
      return response;
    });

    return;
  }

  const router = createRouter(plugins);

  const rpcHandler = new RPCHandler(router, {
    plugins: [new BatchHandlerPlugin()],
    interceptors: [onError((error) => formatORPCError(error))],
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
    interceptors: [onError((error) => formatORPCError(error))],
  });

  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.all("/api/rpc/*", async (c) => {
    const req = c.req.raw;
    const context = await createRequestContext(req, auth, db);

    const result = await rpcHandler.handle(req, {
      prefix: "/api/rpc",
      context,
    });

    return result.response ? c.newResponse(result.response.body, result.response) : c.text("Not Found", 404);
  });

  app.all("/api/*", async (c) => {
    const req = c.req.raw;
    const context = await createRequestContext(req, auth, db);

    const result = await apiHandler.handle(req, {
      prefix: "/api",
      context,
    });

    return result.response ? c.newResponse(result.response.body, result.response) : c.text("Not Found", 404);
  });
}

async function setupProductionRoutes(app: Hono, config: RuntimeConfig, routerModule?: RouterModule) {
  app.use("/*", serveStatic({ root: "./dist" }));

  if (routerModule) {
    logger.info("[Head] Remote Router module loaded for head extraction");

    app.get("*", async (c) => {
      try {
        const url = new URL(c.req.url);
        const { env, title, hostUrl } = config;

        const headData = await routerModule.getRouteHead(url.pathname, {
          assetsUrl: config.ui.url,
          runtimeConfig: { env, title, hostUrl, apiBase: "/api", rpcBase: "/api/rpc" },
        });

        const headHtml = renderHeadToString(headData);
        const indexHtml = await readFile(resolve(import.meta.dirname, "./dist/index.html"), "utf-8");
        const html = injectHeadAndConfig(indexHtml, config, headHtml);

        return c.html(html);
      } catch (error) {
        logger.error("[Head] Extraction error:", error);
        const indexHtml = await readFile(resolve(import.meta.dirname, "./dist/index.html"), "utf-8");
        const injectedHtml = injectRuntimeConfig(indexHtml, config);
        return c.html(injectedHtml);
      }
    });
  } else {
    logger.info("[Head] Head extraction disabled - no ui.ssr URL configured");

    app.get("*", async (c) => {
      const indexHtml = await readFile(resolve(import.meta.dirname, "./dist/index.html"), "utf-8");
      const injectedHtml = injectRuntimeConfig(indexHtml, config);
      return c.html(injectedHtml);
    });
  }
}

export const startServer = Effect.gen(function* () {
  const port = Number(process.env.PORT) || 3001;
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
        "http://localhost:3001",
        "http://localhost:3002",
      ],
      credentials: true,
    })
  );

  app.use("/*", compress());

  app.get("/health", (c) => c.text("OK"));

  setupApiRoutes(app, config, plugins, auth, db);

  if (isDev) {
    logger.info(`[Config] UI source: ${config.ui.source} → ${config.ui.url}`);
    logger.info(`[Config] API source: ${config.api.source} → ${config.api.url}`);
    if (config.api.proxy) {
      logger.info(`[Config] API proxy: ${config.api.proxy}`);
    }

    const rsbuild = yield* Effect.tryPromise(() =>
      createRsbuild({
        cwd: resolve(import.meta.dirname, ".."),
        rsbuildConfig,
      })
    );

    const devServer = yield* Effect.tryPromise(() => rsbuild.createDevServer());

    const server = createServer((req, res) => {
      const url = req.url || "/";

      if (url.startsWith("/api")) {
        const fetchReq = new Request(`http://localhost:${port}${url}`, {
          method: req.method,
          headers: nodeHeadersToHeaders(req.headers),
          body: req.method !== "GET" && req.method !== "HEAD" ? req : undefined,
          duplex: "half",
        } as RequestInit);

        Promise.resolve(app.fetch(fetchReq))
          .then(async (response: Response) => {
            res.statusCode = response.status;
            response.headers.forEach((value: string, key: string) => {
              res.setHeader(key, value);
            });
            const body = await response.arrayBuffer();
            res.end(Buffer.from(body));
          })
          .catch((err: Error) => {
            logger.error("[API] Error handling request:", err);
            res.statusCode = 500;
            res.end("Internal Server Error");
          });
        return;
      }

      devServer.middlewares(req, res);
    });

    server.listen(port, () => {
      logger.info(`Host dev server running at http://localhost:${port}`);
      logger.info(`  http://localhost:${port}/api     → REST API (OpenAPI docs)`);
      logger.info(`  http://localhost:${port}/api/rpc → RPC endpoint`);
    });

    devServer.afterListen();
    devServer.connectWebSocket({ server });
  } else {
    let routerModule: RouterModule | undefined;

    if (config.ui.ssrUrl) {
      logger.info("[Head] Loading Remote Router module for head extraction...");
      const result = yield* loadRouterModule(config).pipe(Effect.either);
      if (result._tag === "Right") {
        routerModule = result.right;
        logger.info("[Head] Remote Router module loaded successfully");
      } else {
        logger.warn("[Head] Failed to load Router module, continuing without head extraction");
      }
    }

    yield* Effect.sync(() => setupProductionRoutes(app, config, routerModule));

    serve({ fetch: app.fetch, port }, (info) => {
      logger.info(`Host production server running at http://localhost:${info.port}`);
      logger.info(`  http://localhost:${info.port}/api     → REST API (OpenAPI docs)`);
      logger.info(`  http://localhost:${info.port}/api/rpc → RPC endpoint`);
    });
  }
});

export const ServerLive = FullServerLive;

export const runServer = async () => {
  const runtime = ManagedRuntime.make(ServerLive);

  const shutdown = async () => {
    console.log("[Server] Shutting down...");
    await runtime.dispose();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  try {
    await runtime.runPromise(startServer);
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

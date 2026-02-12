import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import {
	Cause,
	Deferred,
	Effect,
	Exit,
	Fiber,
	Layer,
	ManagedRuntime,
} from "every-plugin/effect";
import { formatORPCError } from "every-plugin/errors";
import { onError } from "every-plugin/orpc";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { BaseLive, PluginsLive } from "./layers";
import { type Auth, AuthService } from "./services/auth";
import { ConfigService, type RuntimeConfig } from "./services/config";
import { createRequestContext } from "./services/context";
import { type Database, DatabaseService } from "./services/database";
import { PluginsService } from "./services/plugins";
import { createRouter } from "./services/router";
import { logger } from "./utils/logger";

function extractErrorDetails(error: unknown): {
	message: string;
	stack?: string;
	cause?: string;
} {
	if (!error) return { message: "Unknown error (null/undefined)" };

	if (error instanceof Error) {
		const details: { message: string; stack?: string; cause?: string } = {
			message: error.message || error.name || "Error",
			stack: error.stack,
		};

		if (error.cause) {
			if (error.cause instanceof Error) {
				details.cause = `${error.cause.name}: ${error.cause.message}`;
			} else if (
				typeof error.cause === "object" &&
				"_tag" in (error.cause as object)
			) {
				try {
					const squashed = Cause.squash(error.cause as Cause.Cause<unknown>);
					if (squashed instanceof Error) {
						details.cause = `[Effect] ${squashed.name}: ${squashed.message}`;
					} else {
						details.cause = `[Effect] ${String(squashed)}`;
					}
				} catch {
					details.cause = `[Effect Cause] ${JSON.stringify(error.cause)}`;
				}
			} else {
				details.cause = String(error.cause);
			}
		}

		return details;
	}

	if (typeof error === "object" && error !== null) {
		if ("_tag" in error) {
			try {
				const squashed = Cause.squash(error as Cause.Cause<unknown>);
				return extractErrorDetails(squashed);
			} catch {
				return { message: `[Effect] ${JSON.stringify(error)}` };
			}
		}

		if ("message" in error) {
			return { message: String((error as { message: unknown }).message) };
		}

		return { message: JSON.stringify(error) };
	}

	return { message: String(error) };
}

export async function proxyRequest(
	req: Request,
	targetBase: string,
	rewriteCookies = false,
): Promise<Response> {
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
				"__Secure-better-auth.",
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
		responseHeaders.delete("set-cookie");
		const setCookies =
			typeof response.headers.getSetCookie === "function"
				? response.headers.getSetCookie()
				: (response.headers
						.get("set-cookie")
						?.split(/,(?=\s*(?:__Secure-|__Host-)?\w+=)/) ?? []);
		for (const cookie of setCookies) {
			const rewritten = cookie
				.replace(/^(__Secure-|__Host-)/i, "")
				.replace(/;\s*Domain=[^;]*/gi, "")
				.replace(/;\s*Secure/gi, "");
			responseHeaders.append("set-cookie", rewritten);
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
	auth: Auth,
	db: Database,
	router: ReturnType<typeof createRouter>,
) {
	const isProxyMode = !!config.api.proxy;

	if (isProxyMode) {
		const proxyTarget = config.api.proxy!;
		logger.info(`[API] Proxy mode enabled → ${proxyTarget}`);

		app.all("/api/*", async (c: Context) => {
			if (c.req.path === "/api/_health") {
				return c.json({
					status: "ok",
					ssr: "available",
				});
			}
			const response = await proxyRequest(c.req.raw, proxyTarget, true);
			return response;
		});

		return;
	}

	app.get("/api/_health", (c: Context) => {
		return c.json({
			status: "ok",
			ssr: "available",
		});
	});

	const rpcHandler = new RPCHandler(router, {
		plugins: [new BatchHandlerPlugin()],
		interceptors: [
			onError((error: unknown) => {
				formatORPCError(error);
				throw error;
			}),
		],
	});

	const apiHandler = new OpenAPIHandler(router, {
		plugins: [
			new OpenAPIReferencePlugin({
				schemaConverters: [new ZodToJsonSchemaConverter()],
				specGenerateOptions: {
					info: {
						title: "API",
						version: "1.0.0",
					},
					servers: [{ url: `${config.hostUrl}/api` }],
				},
			}),
		],
		interceptors: [
			onError((error: unknown) => {
				formatORPCError(error);
				throw error;
			}),
		],
	});

	const handleOrpc = async (
		c: Context,
		handler: typeof rpcHandler | typeof apiHandler,
		prefix: `/${string}`,
	) => {
		const rawClone =
			c.req.method === "GET" || c.req.method === "HEAD"
				? null
				: c.req.raw.clone();

		const baseContext = await createRequestContext(c.req.raw, auth, db);
		let cachedRawBody: string | null = null;
		const context = {
			...baseContext,
			getRawBody: async () => {
				if (cachedRawBody !== null) return cachedRawBody;
				if (!rawClone) {
					cachedRawBody = "";
					return cachedRawBody;
				}
				cachedRawBody = await rawClone.text();
				return cachedRawBody;
			},
		};

		const result = await handler.handle(c.req.raw, { prefix, context });
		return result.response
			? c.newResponse(result.response.body, result.response)
			: c.text("Not Found", 404);
	};

	app.on(["POST", "GET"], "/api/auth/*", (c: Context) =>
		auth.handler(c.req.raw),
	);
	app.all("/api/rpc/*", (c: Context) => handleOrpc(c, rpcHandler, "/api/rpc"));
	app.all("/api/*", (c: Context) => handleOrpc(c, apiHandler, "/api"));
}

// HTML shell with proper Module Federation initialization
function createHtmlShell(
	assetsUrl: string,
	runtimeConfig: Record<string, unknown>,
): string {
	return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Everything Dev</title>
    <style>
      body { 
        margin: 0; 
        font-family: system-ui, -apple-system, sans-serif;
        background: #171717; 
        color: #fafafa; 
        min-height: 100vh;
      }
      #root {
        min-height: 100vh;
      }
    </style>
    <script>
      window.__RUNTIME_CONFIG__ = ${JSON.stringify(runtimeConfig)};
    </script>
  </head>
  <body>
    <div id="root">
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;">
        <div id="loading-text">Loading...</div>
      </div>
    </div>
    <script>
      // Initialize Module Federation runtime and load UI
      (async () => {
        const loadingText = document.getElementById('loading-text');
        
        try {
          // Load the remote entry script dynamically to ensure proper initialization
          const remoteEntryUrl = '${assetsUrl}/remoteEntry.js';
          
          // Create script element for remoteEntry
          const script = document.createElement('script');
          script.src = remoteEntryUrl;
          script.type = 'text/javascript';
          
          // Wait for script to load
          await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load remoteEntry.js'));
            document.head.appendChild(script);
          });
          
          // Give MF runtime a moment to initialize
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Try to load the remote routes
          let attempts = 0;
          const maxAttempts = 10;
          let remote;
          
          while (attempts < maxAttempts) {
            try {
              remote = await import('ui/Routes');
              break;
            } catch (err) {
              attempts++;
              if (attempts >= maxAttempts) throw err;
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
          
          if (remote && remote.routeTree) {
            console.log('[Host] Remote UI loaded successfully:', remote);
            loadingText.textContent = 'UI Loaded - Starting App...';
            
            // The routes are now available, the actual rendering would happen here
            // For now, just show success message
            setTimeout(() => {
              loadingText.textContent = 'Everything Dev is running!';
            }, 500);
          } else {
            throw new Error('Remote does not export routeTree');
          }
          
        } catch (err) {
          console.error('[Host] Failed to load remote UI:', err);
          document.getElementById('root').innerHTML = 
            '<div style="padding:2rem;text-align:center;">' +
            '<h2>Failed to load UI</h2>' +
            '<p>' + err.message + '</p>' +
            '<p>Please check that the UI server is running at: ' + window.__RUNTIME_CONFIG__.assetsUrl + '</p>' +
            '<button onclick="location.reload()" style="margin-top:1rem;padding:0.5rem 1rem;cursor:pointer;">Retry</button>' +
            '</div>';
        }
      })();
    </script>
  </body>
</html>`;
}

export const createStartServer = (onReady?: () => void) =>
	Effect.gen(function* () {
		const port = Number(process.env.PORT) || 3000;
		const isDev = process.env.NODE_ENV !== "production";

		const config = yield* ConfigService;
		const db = yield* DatabaseService;
		const auth = yield* AuthService;
		const plugins = yield* PluginsService;

		const app = new Hono();

		app.onError((err, c) => {
			const details = extractErrorDetails(err);
			logger.error(`[Hono Error] ${c.req.method} ${c.req.path}`);
			logger.error(`[Hono Error] Message: ${details.message}`);
			if (details.cause) {
				logger.error(`[Hono Error] Cause: ${details.cause}`);
			}
			if (details.stack) {
				logger.error(`[Hono Error] Stack:\n${details.stack}`);
			}
			return c.json({ error: details.message, cause: details.cause }, 500);
		});

		app.use(
			"/*",
			cors({
				origin: process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) ?? [
					config.hostUrl,
					config.ui.url,
				],
				credentials: true,
			}),
		);

		app.get("/health", (c: Context) => c.text("OK"));

		const apiRouter = createRouter(plugins);
		setupApiRoutes(app, config, auth, db, apiRouter);

		logger.info(`[Config] Host URL: ${config.hostUrl}`);
		logger.info(`[Config] UI source: ${config.ui.source} → ${config.ui.url}`);
		logger.info(
			`[Config] API source: ${config.api.source} → ${config.api.url}`,
		);
		if (config.api.proxy) {
			logger.info(`[Config] API proxy: ${config.api.proxy}`);
		}

		// Static files in production
		if (!isDev) {
			app.use("/static/*", serveStatic({ root: "./dist" }));
			app.use("/favicon.ico", serveStatic({ root: "./dist" }));
			app.use("/icon.svg", serveStatic({ root: "./dist" }));
			app.use("/manifest.json", serveStatic({ root: "./dist" }));
			app.use("/robots.txt", serveStatic({ root: "./dist" }));
		}

		// Serve HTML shell for all non-API routes
		app.get("*", async (c: Context) => {
			const { env, account } = config;
			const assetsUrl = config.ui.url;

			const runtimeConfig = {
				env,
				account,
				assetsUrl,
				apiBase: "/api",
				rpcBase: "/api/rpc",
			};

			return c.html(createHtmlShell(assetsUrl, runtimeConfig));
		});

		const startHttpServer = () => {
			const hostname = process.env.HOST || "0.0.0.0";
			const mode = isDev ? "dev" : "production";
			const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
				logger.info(
					`Host ${mode} server running at http://${hostname}:${info.port}`,
				);
				logger.info(
					`  http://${hostname}:${info.port}/api     → REST API (OpenAPI docs)`,
				);
				logger.info(`  http://${hostname}:${info.port}/api/rpc → RPC endpoint`);
				onReady?.();
			});
			return server;
		};

		const httpServer = startHttpServer();

		yield* Effect.addFinalizer(() =>
			Effect.promise(
				() =>
					new Promise<void>((resolve) => {
						logger.info("[Server] Closing HTTP server...");
						httpServer.close(() => {
							logger.info("[Server] HTTP server closed");
							resolve();
						});
					}),
			),
		);

		yield* Effect.never;
	});

export interface ServerInput {
	config: RuntimeConfig;
}

export interface ServerHandle {
	ready: Promise<void>;
	shutdown: () => Promise<void>;
}

export const runServer = (input: ServerInput): ServerHandle => {
	const ConfigLive = Layer.succeed(ConfigService, input.config);
	const ServerLive = Layer.provideMerge(
		Layer.mergeAll(BaseLive, PluginsLive),
		ConfigLive,
	);

	const runtime = ManagedRuntime.make(ServerLive);
	let serverFiber: Fiber.RuntimeFiber<void, never> | null = null;

	const program = Effect.gen(function* () {
		const readyDeferred = yield* Deferred.make<void>();

		const fiber = yield* Effect.forkDaemon(
			Effect.scoped(
				createStartServer(() => Deferred.unsafeDone(readyDeferred, Exit.void)),
			),
		);

		serverFiber = fiber;

		yield* Deferred.await(readyDeferred);
	});

	const ready = runtime.runPromise(program);

	const shutdown = async () => {
		logger.info("[Server] Shutting down...");

		if (serverFiber) {
			await Effect.runPromise(Fiber.interrupt(serverFiber));
		}

		await runtime.dispose();
		logger.info("[Server] Shutdown complete");
	};

	return { ready, shutdown };
};

export const runServerBlocking = async (input: ServerInput) => {
	const handle = runServer(input);

	process.on(
		"SIGINT",
		() => void handle.shutdown().then(() => process.exit(0)),
	);
	process.on(
		"SIGTERM",
		() => void handle.shutdown().then(() => process.exit(0)),
	);

	try {
		await handle.ready;
		await new Promise(() => {});
	} catch (err) {
		console.error("Failed to start server:", err);
		process.exit(1);
	}
};

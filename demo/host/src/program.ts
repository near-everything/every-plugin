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
import {
	loadRouterModule,
	type RouterModule,
} from "./services/federation.server";
import {
	installSsrApiClientGlobal,
	runWithSsrApiClient,
} from "./services/ssr-api-client";
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
	loadingState: {
		status: string;
		startTime: number;
		milestones: string[];
		error: Error | null;
	},
) {
	const getHealthStatus = () => {
		const elapsed = Date.now() - loadingState.startTime;
		return {
			status: loadingState.status,
			ssr: loadingState.status === "ready" ? "available" : "unavailable",
			uptime: elapsed,
			milestones: loadingState.milestones,
			...(loadingState.error ? { error: loadingState.error.message } : {}),
		};
	};

	const isProxyMode = !!config.api.proxy;

	if (isProxyMode) {
		const proxyTarget = config.api.proxy!;
		logger.info(`[API] Proxy mode enabled → ${proxyTarget}`);

		app.all("/api/*", async (c: Context) => {
			if (c.req.path === "/api/_health") {
				return c.json(getHealthStatus());
			}
			const response = await proxyRequest(c.req.raw, proxyTarget, true);
			return response;
		});

		return;
	}

	app.get("/api/_health", (c: Context) => {
		return c.json(getHealthStatus());
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
						title: "API", // TODO: title from api.title
						// description, other spec gen fields
						version: "1.0.0", // TODO: version from api.version
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
		// Clone early so raw body can be read later even after oRPC consumes the request body.
		const rawClone = (c.req.method === "GET" || c.req.method === "HEAD")
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

export const createStartServer = (onReady?: () => void) =>
	Effect.gen(function* () {
		const port = Number(process.env.PORT) || 3000;
		const isDev = process.env.NODE_ENV !== "production";

		const config = yield* ConfigService;
		const db = yield* DatabaseService;
		const auth = yield* AuthService;
		const plugins = yield* PluginsService;

		// Ensure the UI SSR remote can always resolve `$apiClient` safely.
		// This uses AsyncLocalStorage to prevent cross-request client leakage.
		installSsrApiClientGlobal();

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

		let ssrRouterModule: RouterModule | null = null;

		const loadingState = {
			status: "loading" as "loading" | "ready" | "failed",
			startTime: Date.now(),
			milestones: [] as string[],
			error: null as Error | null,
		};

		const logMilestone = (name: string) => {
			const elapsed = Date.now() - loadingState.startTime;
			const message = `[SSR] [+${elapsed}ms] ${name}`;
			logger.info(message);
			loadingState.milestones.push(message);
		};

		setupApiRoutes(app, config, auth, db, apiRouter, loadingState);

		logger.info(`[Config] Host URL: ${config.hostUrl}`);
		logger.info(`[Config] UI source: ${config.ui.source} → ${config.ui.url}`);
		logger.info(
			`[Config] API source: ${config.api.source} → ${config.api.url}`,
		);
		if (config.api.proxy) {
			logger.info(`[Config] API proxy: ${config.api.proxy}`);
		}

		if (!isDev) {
			app.use("/static/*", serveStatic({ root: "./dist" }));
			app.use("/favicon.ico", serveStatic({ root: "./dist" }));
			app.use("/icon.svg", serveStatic({ root: "./dist" }));
			app.use("/manifest.json", serveStatic({ root: "./dist" }));
			app.use("/robots.txt", serveStatic({ root: "./dist" }));
		}

		logMilestone("Server starting");

		app.get("*", async (c: Context) => {
			console.log(`[HTTP] ${c.req.method} ${c.req.url}`);
			const loadingTime = Date.now() - loadingState.startTime;
			const isTimedOut = loadingTime > 30000;

			if (loadingState.status !== "ready") {
				if (loadingState.status === "failed" || isTimedOut) {
					loadingState.status = "failed";

					const clientUrl = config.ui.url;
					const runtimeConfig = {
						env: config.env,
						account: config.account,
						assetsUrl: clientUrl,
						apiBase: "/api",
						rpcBase: "/api/rpc",
					};

					return c.html(
						`<!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="utf-8" />
              <title>Loading...</title>
              <style>
                body { background: #171717; color: #fafafa; display: flex; align-items: center; justify-content: center; height: 100vh; }
                .fade { animation: fadeIn 0.3s ease-in; }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                .error { color: #fca5a5; }
              </style>
              <script src="${clientUrl}/remoteEntry.js"></script>
              <script>
                window.__RUNTIME_CONFIG__ = ${JSON.stringify(runtimeConfig)};
                window.addEventListener('load', function() { 
                  window.__hydrate?.(); 
                });
              </script>
            </head>
            <body>
              <div class="fade">
                ${
									loadingState.error
										? `<p class="error">❌ SSR Failed to Load</p>
                     <p>API endpoints remain available.</p>
                     <p>Error: ${loadingState.error.message}</p>`
										: `<p>Loading...</p>`
								}
              </div>
            </body>
          </html>`,
						503,
					);
				}

				return c.html(
					`<!DOCTYPE html>
          <html lang="en">
            <head>
              <style>
                body { background: #171717; color: #fafafa; display: flex; align-items: center; justify-content: center; height: 100vh; }
                .fade { animation: fadeIn 0.3s ease-in; }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
              </style>
            </head>
            <body>
              <div class="fade">Loading...</div>
            </body>
          </html>`,
					503,
				);
			}

			try {
				const { env, account } = config;
				const assetsUrl = config.ui.url;

				const requestContext = await createRequestContext(c.req.raw, auth, db);
				const pluginApi = plugins.api as {
					createClient?: (ctx: unknown) => unknown;
				} | null;
				const ssrApiClient = pluginApi?.createClient
					? pluginApi.createClient(requestContext)
					: undefined;

				logger.info(`[SSR] Request: ${c.req.method} ${c.req.path}`);
				logger.info(`[SSR] ssrRouterModule exists: ${!!ssrRouterModule}`);
				if (
					ssrRouterModule &&
					typeof ssrRouterModule.renderToStream === "function"
				) {
					logger.info(`[SSR] renderToStream is a function`);
				}

				const render = () =>
					ssrRouterModule?.renderToStream(c.req.raw, {
						assetsUrl,
						session: requestContext.session,
						runtimeConfig: {
							env,
							account,
							assetsUrl,
							apiBase: "/api",
							rpcBase: "/api/rpc",
						},
					});

				const result = ssrApiClient
					? await runWithSsrApiClient(ssrApiClient, render)
					: await render();
				logger.info(`[SSR] Render complete, status: ${result?.statusCode}`);
				return new Response(result?.stream, {
					status: result?.statusCode,
					headers: result?.headers,
				});
			} catch (error) {
				logger.error("[SSR] Streaming error:", error);
				return c.html(
					`
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
      `,
					500,
				);
			}
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

		yield* Effect.fork(
			Effect.gen(function* () {
				logMilestone("Starting module load");
				const ssrTarget = config.ui.ssrUrl || config.ui.url || "unknown";
				const isLocalUI = config.ui.source === "local";
				logger.info(
					`[SSR] Loading Router module from ${ssrTarget} (${isLocalUI ? "local" : "remote"} mode)`,
				);

				const routerModuleResult = yield* loadRouterModule(config).pipe(
					Effect.either,
				);

				if (routerModuleResult._tag === "Left") {
					loadingState.status = "failed";
					loadingState.error = routerModuleResult.left;
					logMilestone("Load failed");
					logger.error(
						"[SSR] Failed to load Router module:",
						routerModuleResult.left,
					);
					logger.warn("[SSR] Server running in API-only mode, SSR disabled");
					return;
				}

				ssrRouterModule = routerModuleResult.right;
				loadingState.status = "ready";
				logMilestone("Load successful");
				logger.info(
					"[SSR] Router module loaded successfully, SSR routes active",
				);
			}),
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

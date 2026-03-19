import { serve } from "@hono/node-server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { type ApiPluginResult, loadApiPluginsFromRuntimeConfig } from "./api";
import { registerSharedFromResolved } from "./mf";
import { loadGeneratedSharedUi } from "./shared";
import type { RuntimeConfig } from "./types";

export interface HostServerConfig {
	runtimeConfig: RuntimeConfig;
	configDir: string;
	port?: number;
}

export interface HostServerHandle {
	ready: Promise<void>;
	shutdown: () => Promise<void>;
}

export function createHostServer(config: HostServerConfig): HostServerHandle {
	const port = config.port ?? 3000;
	const { runtimeConfig, configDir } = config;

	let shutdownImpl: (() => Promise<void>) | null = null;

	const ready = (async () => {
		const started = await runHostServer({ runtimeConfig, configDir, port });
		shutdownImpl = started.shutdown;
	})();

	const shutdown = async () => {
		console.log("[Host] Shutting down...");
		await ready.catch(() => {});
		if (shutdownImpl) {
			await shutdownImpl().catch(() => {});
		}
		console.log("[Host] Shutdown complete");
	};

	return { ready, shutdown };
}

async function runHostServer(opts: {
	runtimeConfig: RuntimeConfig;
	configDir: string;
	port: number;
}): Promise<{ shutdown: () => Promise<void> }> {
	const { runtimeConfig, configDir, port } = opts;

	const shared = loadGeneratedSharedUi(configDir);
	registerSharedFromResolved(shared);

	let apiPlugin: ApiPluginResult | null = null;
	let apiPluginError: string | null = null;
	let apiPluginLoading: Promise<ApiPluginResult | null> | null = null;
	let rpcHandler: RPCHandler | null = null;
	let openApiHandler: OpenAPIHandler | null = null;

	const initApiHandlers = (plugin: ApiPluginResult) => {
		rpcHandler = new RPCHandler(plugin.router as any, {
			plugins: [new BatchHandlerPlugin()],
		});
		openApiHandler = new OpenAPIHandler(plugin.router as any, {
			plugins: [
				new OpenAPIReferencePlugin({
					schemaConverters: [new ZodToJsonSchemaConverter()],
				}),
			],
		});
	};

	const ensureApiPluginLoaded = async (): Promise<ApiPluginResult | null> => {
		if (apiPlugin) return apiPlugin;
		if (!runtimeConfig.api) return null;
		if (apiPluginLoading) return apiPluginLoading;

		apiPluginLoading = loadApiPluginsFromRuntimeConfig(
			runtimeConfig,
			process.env as any,
		)
			.then((plugin) => {
				if (plugin) {
					apiPlugin = plugin;
					apiPluginError = null;
					initApiHandlers(plugin);
				}
				return plugin;
			})
			.catch((e) => {
				apiPluginError = e instanceof Error ? e.message : String(e);
				return null;
			})
			.finally(() => {
				apiPluginLoading = null;
			});

		return apiPluginLoading;
	};

	// Kick off API plugin load in the background; host should still start even if
	// the remote isn't ready yet.
	void ensureApiPluginLoaded();

	const app = new Hono();

	app.use(
		"/*",
		cors({
			origin: runtimeConfig.hostUrl,
			credentials: true,
		}),
	);

	app.get("/health", (c) => c.text("OK"));
	app.get("/ready", async (c) => {
		type Check = {
			name: string;
			url: string;
			required: boolean;
			ok: boolean;
			status?: number;
			latencyMs?: number;
			error?: string;
		};

		const probe = async (url: string, timeoutMs = 400): Promise<Check> => {
			const started = Date.now();
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutMs);
			try {
				const res = await fetch(url, { signal: controller.signal });
				return {
					name: "",
					url,
					required: true,
					ok: res.ok,
					status: res.status,
					latencyMs: Date.now() - started,
				};
			} catch (e) {
				return {
					name: "",
					url,
					required: true,
					ok: false,
					latencyMs: Date.now() - started,
					error: e instanceof Error ? e.message : String(e),
				};
			} finally {
				clearTimeout(timer);
			}
		};

		const checks: Check[] = [];

		if (runtimeConfig.ui?.url) {
			const base = runtimeConfig.ui.url.replace(/\/$/, "");
			const manifest = await probe(`${base}/mf-manifest.json`);
			manifest.name = "ui";
			// mf-manifest.json is preferred but not always present; fall back to
			// remoteEntry.js for readiness.
			manifest.required = false;
			checks.push(manifest);
			if (!manifest.ok) {
				const remoteEntry = await probe(`${base}/remoteEntry.js`);
				remoteEntry.name = "ui";
				remoteEntry.required = true;
				checks.push(remoteEntry);
			} else {
				manifest.required = true;
			}
		}

		if (runtimeConfig.ui?.ssrUrl) {
			const base = runtimeConfig.ui.ssrUrl.replace(/\/$/, "");
			const ssr = await probe(`${base}/`);
			ssr.name = "ui-ssr";
			ssr.required = false;
			checks.push(ssr);
		}

		if (runtimeConfig.api?.url) {
			const base = runtimeConfig.api.url.replace(/\/$/, "");
			const api = await probe(`${base}/`);
			api.name = "api";
			api.required = true;
			checks.push(api);
		}

		if (runtimeConfig.api) {
			checks.push({
				name: "api-plugin",
				url: runtimeConfig.api.entry,
				required: true,
				ok: apiPlugin !== null,
				status: apiPlugin !== null ? 200 : 503,
				error:
					apiPlugin !== null
						? undefined
						: apiPluginLoading
							? "loading"
							: (apiPluginError ?? "not loaded"),
			});
			if (!apiPlugin && !apiPluginLoading) {
				void ensureApiPluginLoaded();
			}
		}

		const allRequiredOk = checks.filter((x) => x.required).every((x) => x.ok);

		return c.json(
			{
				status: allRequiredOk ? "ready" : "not_ready",
				host: {
					url: runtimeConfig.hostUrl,
					env: runtimeConfig.env,
				},
				checks,
				timestamp: new Date().toISOString(),
			},
			allRequiredOk ? 200 : 503,
		);
	});
	app.get("/api/_health", (c) =>
		c.json({
			status: "ready",
			mode: runtimeConfig.env,
			ui: runtimeConfig.ui?.url ?? null,
			api: runtimeConfig.api?.url ?? null,
			apiPluginLoaded: apiPlugin !== null,
			apiPluginLoading: apiPluginLoading !== null,
			apiPluginError,
		}),
	);

	app.all("/api/rpc/*", async (c) => {
		if (!rpcHandler) {
			await ensureApiPluginLoaded();
		}
		if (!rpcHandler) {
			return c.json(
				{ error: "API plugin not loaded", detail: apiPluginError },
				503,
			);
		}
		const result = await rpcHandler.handle(c.req.raw, {
			prefix: "/api/rpc",
			context: {},
		});
		return result.response
			? c.newResponse(result.response.body, result.response)
			: c.text("Not Found", 404);
	});

	app.all("/api/*", async (c) => {
		if (!openApiHandler) {
			await ensureApiPluginLoaded();
		}
		if (!openApiHandler) {
			return c.json(
				{ error: "API plugin not loaded", detail: apiPluginError },
				503,
			);
		}
		const result = await openApiHandler.handle(c.req.raw, {
			prefix: "/api",
			context: {},
		});
		return result.response
			? c.newResponse(result.response.body, result.response)
			: c.text("Not Found", 404);
	});

	if (runtimeConfig.ui) {
		app.all("/__mf/ui/*", async (c) => {
			const targetUrl = `${runtimeConfig.ui!.url}${c.req.path.replace("/__mf/ui", "")}`;
			const response = await fetch(targetUrl, {
				method: c.req.method,
				headers: c.req.header(),
			});
			return response;
		});

		if (runtimeConfig.ui.ssrUrl) {
			app.all("/__mf/ui/ssr/*", async (c) => {
				const targetUrl = `${runtimeConfig.ui!.ssrUrl}${c.req.path.replace("/__mf/ui/ssr", "")}`;
				const response = await fetch(targetUrl, {
					method: c.req.method,
					headers: c.req.header(),
				});
				return response;
			});
		}
	}

	app.get("*", async (c) => {
		const uiEntry = runtimeConfig.ui?.entry ?? "";
		const uiName = runtimeConfig.ui?.name ?? "ui";
		const uiUrl = runtimeConfig.ui?.url ?? "";

		return c.html(`
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1.0" />
					<title>Docs Book</title>
				</head>
				<body>
					<div id="root"></div>
					<script>
						window.__RUNTIME_CONFIG__ = ${JSON.stringify({
							env: runtimeConfig.env,
							account: runtimeConfig.account,
							hostUrl: runtimeConfig.hostUrl,
							ui: runtimeConfig.ui
								? {
										name: runtimeConfig.ui.name,
										url: runtimeConfig.ui.url,
										entry: runtimeConfig.ui.entry,
									}
								: undefined,
							api: runtimeConfig.api
								? {
										name: runtimeConfig.api.name,
										url: runtimeConfig.api.url,
										entry: runtimeConfig.api.entry,
									}
								: undefined,
						})};
					</script>
					<script type="module">
						(async () => {
							try {
								const config = window.__RUNTIME_CONFIG__;
								// Some remote bundles still expect Node-style global.
								if (typeof globalThis.global === 'undefined') {
									globalThis.global = globalThis;
								}
								const uiName = config?.ui?.name || 'ui';
								const uiUrl = config?.ui?.url;
								if (!uiUrl) {
									throw new Error('UI URL not configured');
								}
								await new Promise((resolve, reject) => {
									const s = document.createElement('script');
									s.src = uiUrl + '/remoteEntry.js';
									s.onload = resolve;
									s.onerror = () => reject(new Error('Failed to load UI remoteEntry.js'));
									document.head.appendChild(s);
								});
								const container = globalThis[uiName];
								if (!container) {
									throw new Error('Remote container not found: ' + uiName);
								}
								if (typeof container.init === 'function') {
									await container.init({});
								}
								const factory = await container.get('./render');
								const mod = typeof factory === 'function' ? factory() : factory;
								const { render } = mod;
								
								// Render the app
								render(document.getElementById('root'), {
									apiUrl: '/api',
									hostUrl: config?.hostUrl || ''
								});
							} catch (error) {
								console.error('Failed to load UI:', error);
								document.getElementById('root').innerHTML = '<p style="color: red; padding: 2rem;">Error loading UI: ' + error.message + '</p>';
							}
						})();
					</script>
				</body>
			</html>
		`);
	});

	const hostname = process.env.HOST ?? "0.0.0.0";
	let resolveReady: (() => void) | null = null;
	const ready = new Promise<void>((resolve) => {
		resolveReady = resolve;
	});

	const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
		console.log(`[Host] Server running at http://${hostname}:${info.port}`);
		console.log(`[Host] API: http://${hostname}:${info.port}/api/rpc`);
		resolveReady?.();
	});

	await ready;

	return {
		shutdown: () =>
			new Promise<void>((resolve) => {
				try {
					server.close(() => resolve());
				} catch {
					resolve();
				}
			}),
	};
}

export { runHostServer };

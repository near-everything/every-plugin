import { Effect } from "every-plugin/effect";
import { loadBosConfig, type RuntimeConfig } from "everything-dev/config";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadRouterModule } from "@/services/federation.server";
import type { RouterModule } from "@/types";

async function consumeStream(stream: ReadableStream): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let html = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		html += decoder.decode(value, { stream: true });
	}
	html += decoder.decode();
	return html;
}

const mockApiClient = {
	// Kept minimal: the current demo UI SSR routes don't require API calls.
};

describe("SSR Stream Lifecycle", () => {
	let routerModule: RouterModule;
	let config: RuntimeConfig;

	beforeAll(async () => {
		globalThis.$apiClient = mockApiClient;
		config = await loadBosConfig();
		const uiUrl = process.env.BOS_UI_URL;
		const uiSsrUrl = process.env.BOS_UI_SSR_URL ?? uiUrl;
		if (uiUrl) config.ui.url = uiUrl;
		if (uiSsrUrl) config.ui.ssrUrl = uiSsrUrl;
		routerModule = await Effect.runPromise(loadRouterModule(config));
	});

	describe("Stream Completion", () => {
		it("completes stream for root route without timeout", async () => {
			const startTime = Date.now();

			const head = await routerModule.getRouteHead("/", {
				assetsUrl: config.ui.url,
				runtimeConfig: {
					env: config.env,
					account: config.account,
					hostUrl: config.hostUrl,
					apiBase: "/api",
					rpcBase: "/api/rpc",
					assetsUrl: config.ui.url,
				},
			});

			const elapsed = Date.now() - startTime;

			expect(head).toBeDefined();
			expect(head.meta).toBeDefined();
			expect(elapsed).toBeLessThan(5000);
		});

		// NOTE: Authenticated routes are configured with `ssr: false` in the demo UI.
	});

	describe("SSR Configuration", () => {
		it("renders layout route metadata", async () => {
			const head = await routerModule.getRouteHead("/", {
				assetsUrl: config.ui.url,
				runtimeConfig: {
					env: config.env,
					account: config.account,
					hostUrl: config.hostUrl,
					apiBase: "/api",
					rpcBase: "/api/rpc",
					assetsUrl: config.ui.url,
				},
			});

			const titleMeta = head.meta.find(
				(m) => m && typeof m === "object" && "title" in m,
			);
			expect(titleMeta).toBeDefined();
		});

		// NOTE: Auth routes behavior depends on auth strategy.
	});

	describe("SSR Routes", () => {
		const STREAM_TIMEOUT = 5000;

		it("renders root route with full SSR", { timeout: 6000 }, async () => {
			const request = new Request("http://localhost/");
			const startTime = Date.now();

			const result = await routerModule.renderToStream(request, {
				assetsUrl: config.ui.url,
				runtimeConfig: {
					env: config.env,
					account: config.account,
					hostUrl: config.hostUrl,
					apiBase: "/api",
					rpcBase: "/api/rpc",
					assetsUrl: config.ui.url,
				},
			});

			const html = await consumeStream(result.stream);
			const elapsed = Date.now() - startTime;

			expect(elapsed).toBeLessThan(STREAM_TIMEOUT);
			expect(result.statusCode).toBe(200);
			expect(html).toContain("<!DOCTYPE html>");
			expect(html).toContain("</html>");
			expect(html).toContain("demo.everything");
		});
	});

	describe("Full Stream Rendering", () => {
		const STREAM_TIMEOUT = 5000;

		it(
			"completes full stream render for root route",
			{ timeout: 6000 },
			async () => {
				const request = new Request("http://localhost/");
				const startTime = Date.now();

				const result = await routerModule.renderToStream(request, {
					assetsUrl: config.ui.url,
					runtimeConfig: {
						env: config.env,
						account: config.account,
						hostUrl: config.hostUrl,
						apiBase: "/api",
						rpcBase: "/api/rpc",
						assetsUrl: config.ui.url,
					},
				});

				const html = await consumeStream(result.stream);
				const elapsed = Date.now() - startTime;

				expect(elapsed).toBeLessThan(STREAM_TIMEOUT);
				expect(result.statusCode).toBe(200);
				expect(html).toContain("<!DOCTYPE html>");
				expect(html).toContain("</html>");
			},
		);

		// NOTE: Product routes are not part of the current demo UI.
	});
});

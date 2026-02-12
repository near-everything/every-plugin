// ============================================================================
// Router - Standard TanStack Start Pattern
// ============================================================================
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import type { ClientRuntimeConfig, RuntimeConfig } from "everything-dev/types";
import { routeTree } from "ui/Routes";

declare global {
	interface Window {
		__RUNTIME_CONFIG__?: ClientRuntimeConfig;
	}
}

function readRuntimeConfigFromEnv(): RuntimeConfig | null {
	const json = process.env.BOS_RUNTIME_CONFIG;
	if (!json) return null;
	try {
		return JSON.parse(json) as RuntimeConfig;
	} catch {
		return null;
	}
}

function getClientRuntimeConfig(): ClientRuntimeConfig {
	// Browser hydration reads from the SSR-injected script.
	if (typeof window !== "undefined" && window.__RUNTIME_CONFIG__) {
		return window.__RUNTIME_CONFIG__;
	}

	// SSR (and tests) read from BOS_RUNTIME_CONFIG.
	const cfg = readRuntimeConfigFromEnv();
	if (!cfg) {
		return {
			env: (process.env.NODE_ENV === "production"
				? "production"
				: "development") as "development" | "production",
			account: process.env.BOS_ACCOUNT ?? "every.near",
			hostUrl: process.env.HOST_URL,
			assetsUrl: "",
			apiBase: "/api",
			rpcBase: "/api/rpc",
		};
	}

	return {
		env: cfg.env,
		account: cfg.account,
		hostUrl: cfg.hostUrl,
		assetsUrl: cfg.ui.url,
		apiBase: "/api",
		rpcBase: "/api/rpc",
		ui: {
			name: cfg.ui.name,
			url: cfg.ui.url,
		},
	};
}

export function getRouter() {
	const runtimeConfig = getClientRuntimeConfig();
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 5 * 60 * 1000,
				gcTime: 30 * 60 * 1000,
				refetchOnWindowFocus: false,
				retry: 1,
			},
		},
	});

	return createRouter({
		routeTree,
		defaultPreload: "intent",
		context: {
			queryClient,
			assetsUrl: runtimeConfig.assetsUrl,
			runtimeConfig,
		},
	});
}

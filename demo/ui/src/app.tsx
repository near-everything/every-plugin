// ============================================================================
// Standalone App Entry Point
// ============================================================================
// This file is used when running the UI independently (bun run dev/preview)
// It creates the full router and renders the app with all providers.
//
// When consumed via Module Federation, the Host uses routes.remote.tsx
// which only exports the route tree.
// ============================================================================

import { RouterProvider } from "@tanstack/react-router";
import { hydrateRoot } from "react-dom/client";
import { createRouter } from "./router";

// Get runtime config from window or use defaults
const getRuntimeConfig = () => {
	if (typeof window !== "undefined" && window.__RUNTIME_CONFIG__) {
		return window.__RUNTIME_CONFIG__;
	}
	// Default config for standalone mode
	return {
		env: "development",
		account: "local",
		assetsUrl: typeof window !== "undefined" ? window.location.origin : "",
		apiBase: "/api",
		rpcBase: "/api/rpc",
	};
};

// Create router with config
const runtimeConfig = getRuntimeConfig();
const { router, queryClient } = createRouter({
	context: {
		assetsUrl: runtimeConfig.assetsUrl,
		runtimeConfig,
	},
});

// Wait for router to load initial matches
router.load().then(() => {
	if (typeof document !== "undefined") {
		const rootElement = document.getElementById("root");
		if (rootElement) {
			hydrateRoot(rootElement, <RouterProvider router={router} />);
		}
	}
});

// Extend Window interface for runtime config
declare global {
	interface Window {
		__RUNTIME_CONFIG__?: {
			env: string;
			account: string;
			assetsUrl: string;
			apiBase: string;
			rpcBase: string;
		};
	}
}

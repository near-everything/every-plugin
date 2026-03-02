import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserHistory, RouterProvider } from "@tanstack/react-router";
import { RouterClient } from "@tanstack/react-router/ssr/client";
import type { AuthSnapshot } from "everything-dev/runtime";
import { createRoot, hydrateRoot } from "react-dom/client";
import type { RuntimeConfig } from "./services/config";
import { createAppRouter } from "./web/router";
import { createBrowserApiClient } from "./web/runtime";

function readRuntimeConfig(): RuntimeConfig {
	const el = document.getElementById("__BOS_RUNTIME_CONFIG__");
	if (!el) {
		throw new Error("Missing runtime config script tag");
	}
	try {
		return JSON.parse(el.textContent || "{}") as RuntimeConfig;
	} catch {
		return {} as RuntimeConfig;
	}
}

function readAuthSnapshot(): AuthSnapshot {
	const el = document.getElementById("__BOS_AUTH__");
	if (!el) {
		return {
			session: null,
			nearAccountId: null,
			role: null,
			isAuthenticated: false,
			isAdmin: false,
		};
	}
	try {
		const parsed = JSON.parse(el.textContent || "null") as AuthSnapshot | null;
		if (!parsed) throw new Error("empty");
		return parsed;
	} catch {
		return {
			session: null,
			nearAccountId: null,
			role: null,
			isAuthenticated: false,
			isAdmin: false,
		};
	}
}

async function main() {
	const runtimeConfig = readRuntimeConfig();
	const auth = readAuthSnapshot();
	const queryClient = new QueryClient();
	const apiClient = createBrowserApiClient();

	const history = createBrowserHistory();

	const router = await createAppRouter({
		history,
		context: {
			runtimeConfig,
			apiClient,
			queryClient,
			auth,
		},
	});

	const app = (
		<QueryClientProvider client={queryClient}>
			{document.documentElement.hasAttribute("data-ssr") ? (
				<RouterClient router={router} />
			) : (
				<RouterProvider router={router} />
			)}
		</QueryClientProvider>
	);

	if (document.documentElement.hasAttribute("data-ssr")) {
		hydrateRoot(document, app);
	} else {
		const container = document.getElementById("root");
		if (!container) throw new Error("Missing #root");
		createRoot(container).render(app);
	}
}

main().catch((err) => {
	console.error(err);
});

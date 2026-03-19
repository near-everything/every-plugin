import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter, RouterHistory } from "@tanstack/react-router";
import type { AuthSnapshot } from "everything-dev/runtime";
import type { RuntimeConfig } from "../services/config";
import type { ApiClient } from "./api";
import { loadFederatedModule } from "./federation";

export type HostRouterContext = {
	runtimeConfig: RuntimeConfig;
	apiClient: ApiClient;
	queryClient: QueryClient;
	auth: AuthSnapshot;
	assetsUrl?: string;
};

const DEFAULT_UI_ASSETS_URL = "/__mf/ui";

type UiRouterRemote = {
	createRouter: (opts: {
		history: RouterHistory;
		context: {
			assetsUrl: string;
			runtimeConfig: RuntimeConfig;
			apiClient: ApiClient;
			queryClient: QueryClient;
			auth: AuthSnapshot;
		};
	}) => { router: AnyRouter };
};

export async function createAppRouter(opts: {
	history: RouterHistory;
	context: HostRouterContext;
}): Promise<AnyRouter> {
	const assetsUrl = opts.context.assetsUrl ?? DEFAULT_UI_ASSETS_URL;
	const isServer = typeof window === "undefined";
	const hostUrl = opts.context.runtimeConfig.hostUrl;
	const uiEntry = isServer
		? `${hostUrl}/__mf/ui/ssr/remoteEntry.js`
		: `/__mf/ui/mf-manifest.json`;

	const ui = await loadFederatedModule<UiRouterRemote>({
		remoteName: "ui",
		entry: uiEntry,
		module: "Router",
		shared: opts.context.runtimeConfig.shared?.ui,
	});
	const result = ui.createRouter({
		history: opts.history,
		context: {
			assetsUrl,
			runtimeConfig: opts.context.runtimeConfig,
			apiClient: opts.context.apiClient,
			queryClient: opts.context.queryClient,
			auth: opts.context.auth,
		},
	});

	return result.router;
}

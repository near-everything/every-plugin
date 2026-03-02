import { useRouter } from "@tanstack/react-router";
import { adminClient } from "better-auth/client/plugins";
import { createAuthClient as createBetterAuthClient } from "better-auth/react";
import { siwnClient } from "better-near-auth/client";
import { useMemo } from "react";

import type { ApiClient, RouterContext, RuntimeConfig } from "@/types";

export function useUiContext(): RouterContext {
	const router = useRouter();
	return router.options.context as RouterContext;
}

export function useRuntimeConfig(): RuntimeConfig {
	return useUiContext().runtimeConfig;
}

export function useApiClient(): ApiClient {
	return useUiContext().apiClient;
}

export function getRuntimeAccount(
	runtimeConfig: RuntimeConfig | undefined,
): string {
	return runtimeConfig?.account ?? "every.near";
}

export function createAuthClient(runtimeConfig: RuntimeConfig) {
	return createBetterAuthClient({
		baseURL: runtimeConfig.hostUrl,
		fetchOptions: { credentials: "include" },
		plugins: [
			siwnClient({
				domain: getRuntimeAccount(runtimeConfig),
				networkId: "mainnet",
			}),
			adminClient(),
		],
	});
}

export function useAuthClient() {
	const { runtimeConfig } = useUiContext();
	return useMemo(
		() => createAuthClient(runtimeConfig),
		[runtimeConfig.hostUrl, runtimeConfig.account],
	);
}

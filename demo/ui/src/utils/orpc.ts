// ============================================================================
// API Client Utilities - For UI Components
// ============================================================================
// In the new architecture, apiClient and queryClient come from React Context via the Host.
// This file provides stub implementations that will be properly initialized by the Host.

import { QueryClient } from "@tanstack/react-query";

// Re-export types from API contract
export type { ApiClient, ApiContract } from "../../../api/src/contract";

// QueryClient stub - will be properly initialized by Host's QueryClientProvider
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 5 * 60 * 1000,
			gcTime: 30 * 60 * 1000,
			refetchOnWindowFocus: false,
		},
	},
});

// ApiClient stub - will be overridden by Host's ApiClientProvider context
export const apiClient: any = new Proxy(
	{},
	{
		get: () => {
			throw new Error(
				"apiClient not initialized. Ensure ApiClientProvider is mounted by the Host.",
			);
		},
	},
);

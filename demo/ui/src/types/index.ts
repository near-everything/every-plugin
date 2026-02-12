// ============================================================================
// Types - For UI Components
// ============================================================================
// Re-export shared types for the UI

import type { QueryClient } from "@tanstack/react-query";

export interface RouterContext {
	queryClient: QueryClient;
	assetsUrl: string;
	runtimeConfig?: {
		env?: string;
		account?: string;
		hostUrl?: string;
		apiBase?: string;
		rpcBase?: string;
		[key: string]: unknown;
	};
}

export interface ClientRuntimeConfig {
	env: string;
	account: string;
	assetsUrl: string;
	apiBase: string;
	rpcBase: string;
}

export interface CreateRouterOptions {
	context?: Partial<RouterContext>;
}

export interface RouterModule {
	renderToStream: (
		request: Request,
		options: {
			assetsUrl: string;
			session?: unknown;
			runtimeConfig: ClientRuntimeConfig;
		},
	) => Promise<{
		stream: ReadableStream;
		statusCode: number;
		headers: Record<string, string>;
	}>;
}

import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import type { ApiClient } from "./api";

function createHttpApiClient(opts: {
	url: string;
	getCookie?: () => string | null;
}): ApiClient {
	return createORPCClient(
		new RPCLink({
			url: opts.url,
			interceptors: [
				onError((error: unknown) => {
					console.error("oRPC API Error:", error);
				}),
			],
			fetch(input: RequestInfo | URL, init?: RequestInit) {
				const cookie = opts.getCookie?.() ?? null;
				const headers = new Headers(init?.headers);
				if (cookie) headers.set("cookie", cookie);

				return fetch(input, {
					...init,
					headers,
					credentials: "include",
				});
			},
		}),
	) as unknown as ApiClient;
}

export function createBrowserApiClient(): ApiClient {
	return createHttpApiClient({ url: "/api/rpc" });
}

export function createServerApiClient(opts: {
	request: Request;
	hostUrl: string;
}): ApiClient {
	return createHttpApiClient({
		url: `${opts.hostUrl}/api/rpc`,
		getCookie: () => opts.request.headers.get("cookie"),
	});
}

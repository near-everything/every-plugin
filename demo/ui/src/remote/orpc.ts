import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { contract } from "../../../api/src/contract";

export type ApiContract = typeof contract;
export type ApiClient = ContractRouterClient<ApiContract>;

/**
 * IMPORTANT:
 * - In the browser, calls go over HTTP via RPCLink.
 * - During SSR, the host injects a server-side client on `globalThis.$apiClient`.
 *   We must never instantiate/use RPCLink on the server, and we must not
 *   capture `$apiClient` at module-eval time because the SSR remote is loaded
 *   once at host startup.
 */

declare global {
  var $apiClient: ApiClient | undefined;
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: () => { },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: (failureCount, error) => {
        // this needs better parity with the api behavior (oRPC Error and Effect)
        if (error && typeof error === "object" && "message" in error) {
          const message = String(error.message).toLowerCase();
          if (message.includes("fetch") || message.includes("network")) {
            return false;
          }
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

function createApiLink() {
  return new RPCLink({
    url: () => {
      if (typeof window === "undefined") {
        throw new Error("RPCLink is not allowed on the server side.");
      }
      return `${window.location.origin}/api/rpc`;
    },
    interceptors: [
      onError((error: unknown) => {
        console.error("oRPC API Error:", error);

        if (error && typeof error === "object" && "message" in error) {
          const message = String(error.message).toLowerCase();
          if (
            message.includes("fetch") ||
            message.includes("network") ||
            message.includes("failed to fetch")
          ) {
            toast.error("Unable to connect to API", {
              id: "api-connection-error",
              description:
                "The API is currently unavailable. Please try again later.",
            });
          }
        }
      }),
    ],
    fetch(url, options) {
      return fetch(url, {
        ...options,
        credentials: "include",
      });
    },
  });
}

let clientSideApiClient: ApiClient | null = null;

function getClientSideApiClient(): ApiClient {
  if (clientSideApiClient) return clientSideApiClient;
  clientSideApiClient = createORPCClient(createApiLink()) as unknown as ApiClient;
  return clientSideApiClient;
}

function getActiveApiClient(): ApiClient {
  return globalThis.$apiClient ?? getClientSideApiClient();
}

export const apiClient: ApiClient = new Proxy({} as ApiClient, {
  get(_target, prop, _receiver) {
    // Prevent await/apiClient from treating this as a thenable
    if (prop === "then") return undefined;
    const client = getActiveApiClient() as unknown as Record<string, unknown>;
    const value = client[prop as unknown as string];
    if (typeof value === "function") {
      // NOTE: Do NOT call .bind() here.
      // oRPC's client is a Proxy; accessing `.bind` can be interpreted as an RPC path segment.
      return (...args: unknown[]) => (value as (...a: unknown[]) => unknown)(...args);
    }
    return value;
  },
});

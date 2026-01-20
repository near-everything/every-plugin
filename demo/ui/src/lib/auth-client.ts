import { adminClient } from "better-auth/client/plugins";
import { createAuthClient as createBetterAuthClient } from "better-auth/react";
import { siwnClient } from "better-near-auth/client";

function getAuthBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return window.__RUNTIME_CONFIG__?.hostUrl ?? window.location.origin;
}

function createAuthClient() {
  return createBetterAuthClient({
    baseURL: getAuthBaseUrl(),
    fetchOptions: { credentials: "include" },
    plugins: [
      siwnClient({
        domain: typeof window !== "undefined"
          ? (window.__RUNTIME_CONFIG__?.account ?? "every.near")
          : "every.near",
        networkId: "mainnet",
      }),
      adminClient(),
    ],
  });
}

let _authClient: ReturnType<typeof createAuthClient> | undefined;

export function getAuthClient() {
  if (_authClient === undefined) {
    _authClient = createAuthClient();
  }
  return _authClient;
}

export const authClient = getAuthClient();

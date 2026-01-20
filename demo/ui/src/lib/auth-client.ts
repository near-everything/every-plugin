import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { siwnClient } from "better-near-auth/client";

function getAuthBaseUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.__RUNTIME_CONFIG__?.hostUrl ?? window.location.origin;
}

let _authClient: ReturnType<typeof createAuthClient> | null = null;

export function getAuthClient() {
  if (_authClient) return _authClient;
  
  _authClient = createAuthClient({
    baseURL: getAuthBaseUrl(),
    fetchOptions: {
      credentials: "include",
    },
    plugins: [
      siwnClient({
        domain: import.meta.env.PUBLIC_ACCOUNT_ID || "every.near",
        networkId: "mainnet",
      }),
      adminClient(),
    ],
  });
  
  return _authClient;
}

export const authClient = typeof window !== "undefined" 
  ? getAuthClient() 
  : createAuthClient({
      baseURL: "",
      fetchOptions: { credentials: "include" },
      plugins: [
        siwnClient({ domain: "every.near", networkId: "mainnet" }),
        adminClient(),
      ],
    });

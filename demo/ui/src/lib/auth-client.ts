import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { siwnClient } from "better-near-auth/client";

function getBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const base = window.__RUNTIME_CONFIG__?.apiBase;
  return base ? `${window.location.origin}${base}` : window.location.origin;
}

export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  plugins: [
    siwnClient({
      domain: import.meta.env.PUBLIC_ACCOUNT_ID || "every.near",
      networkId: "mainnet",
    }),
    adminClient(),
  ],
});

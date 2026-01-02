import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { siwnClient } from "better-near-auth/client";

export const authClient = createAuthClient({
  baseURL: import.meta.env.BETTER_AUTH_URL,
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

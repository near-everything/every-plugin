import { loadRemote } from "@module-federation/enhanced/runtime";
import {
  type DehydratedState,
  HydrationBoundary,
  QueryClientProvider,
} from "@tanstack/react-query";
import { RouterClient } from "@tanstack/react-router/ssr/client";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { getRuntimeConfig, initializeFederation } from "./federation";
import type { RouterModule } from "./types";

declare global {
  interface Window {
    __DEHYDRATED_STATE__?: DehydratedState;
  }
}

console.log("[Client] Script loaded, starting hydration...");

async function hydrate() {
  console.log("[Client] Initializing federation...");
  await initializeFederation();
  console.log("[Client] Federation initialized");

  const config = getRuntimeConfig();

  const routerModule = await loadRemote<RouterModule>(
    `${config.ui.name}/Router`,
  );

  if (!routerModule) {
    throw new Error(`Failed to load Router module from ${config.ui.name}`);
  }

  const { env, title, hostUrl, apiBase, rpcBase } = config;
  const { router, queryClient } = routerModule.createRouter({
    context: {
      assetsUrl: config.ui.url,
      runtimeConfig: { env, title, hostUrl, apiBase, rpcBase },
    },
  });

  await router.load();

  const dehydratedState = window.__DEHYDRATED_STATE__;

  hydrateRoot(
    document,
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <HydrationBoundary state={dehydratedState}>
          <RouterClient router={router} />
        </HydrationBoundary>
      </QueryClientProvider>
    </StrictMode>,
  );

  console.log("[Client] Hydrated SSR");
}

hydrate().catch((error) => {
  console.error("Failed to hydrate:", error);
});

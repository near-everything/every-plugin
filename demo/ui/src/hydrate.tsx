import { getAssetsUrl, getRuntimeConfig } from "./remote/runtime";

export async function hydrate() {
  console.log("[Hydrate] Starting...");

  const runtimeConfig = getRuntimeConfig();
  if (!runtimeConfig) {
    console.error("[Hydrate] No runtime config found");
    return;
  }

  const { hydrateRoot } = await import("react-dom/client");
  const { RouterClient } = await import("@tanstack/react-router/ssr/client");
  const { QueryClientProvider } = await import("@tanstack/react-query");
  const { createRouter } = await import("./router");

  const { router, queryClient } = createRouter({
    context: {
      assetsUrl: getAssetsUrl(runtimeConfig),
      runtimeConfig,
    },
  });

  console.log("[Hydrate] Calling hydrateRoot...");
  hydrateRoot(
    document,
    <QueryClientProvider client={queryClient}>
      <RouterClient router={router} />
    </QueryClientProvider>,
  );

  console.log("[Hydrate] Complete!");
}

export default hydrate;

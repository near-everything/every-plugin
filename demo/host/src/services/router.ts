import type { RouterClient } from "every-plugin/orpc";
import { os } from "every-plugin/orpc";
import type { PluginResult } from "./plugins";

export function createRouter(plugins: PluginResult) {
  const baseRouter = {
    health: os.route({ method: "GET", path: "/health" }).handler(() => "OK"),
  } as const;

  if (!plugins.status.available || !plugins.api) {
    console.warn("[Router] Plugin router not available, using base router only");
    return baseRouter;
  }

  const pluginApi = plugins.api as { router?: Record<string, unknown> };
  if (!pluginApi.router) {
    console.warn("[Router] Plugin API has no router, using base router only");
    return baseRouter;
  }

  return {
    ...baseRouter,
    ...pluginApi.router,
  } as const;
}

export type AppRouter = ReturnType<typeof createRouter>;
export type AppRouterClient = RouterClient<AppRouter>;

import type { AnyRoute, AnyRouteMatch } from "@tanstack/react-router";
import {
  createMemoryHistory,
  createRouter as createTanStackRouter,
} from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import type {
  RouterContext
} from "./types";

export { createRouter, routeTree } from "./router";
export type {
  ClientRuntimeConfig, CreateRouterOptions, RouterContext
} from "./types";

type HeadMeta = NonNullable<AnyRouteMatch["meta"]>[number];
type HeadLink = NonNullable<AnyRouteMatch["links"]>[number];
type HeadScript = NonNullable<AnyRouteMatch["headScripts"]>[number];

export interface HeadData {
  meta: HeadMeta[];
  links: HeadLink[];
  scripts: HeadScript[];
}

export async function getRouteHead(
  pathname: string,
  context?: Partial<RouterContext>
): Promise<HeadData> {
  const history = createMemoryHistory({ initialEntries: [pathname] });

  const router = createTanStackRouter({
    routeTree,
    history,
    context: {
      queryClient: undefined as never,
      assetsUrl: context?.assetsUrl ?? "",
      runtimeConfig: context?.runtimeConfig,
    },
  });

  const matches = router.matchRoutes(pathname);

  const result: HeadData = { meta: [], links: [], scripts: [] };

  for (const match of matches) {
    const route = router.routesById[match.routeId] as AnyRoute | undefined;
    if (!route?.options?.head) continue;

    let loaderData: unknown = undefined;
    const loaderFn = route.options.loader;

    if (loaderFn) {
      try {
        loaderData = await loaderFn({
          params: match.params,
          context: router.options.context,
          abortController: new AbortController(),
          preload: false,
          cause: "enter",
        } as Parameters<typeof loaderFn>[0]);
      } catch (error) {
        console.warn(
          `[getRouteHead] Loader failed for ${match.routeId}:`,
          error
        );
      }
    }

    try {
      const headResult = await route.options.head({
        loaderData,
        matches,
        match,
        params: match.params,
      } as Parameters<typeof route.options.head>[0]);

      if (headResult?.meta) result.meta.push(...headResult.meta);
      if (headResult?.links) result.links.push(...headResult.links);
      if (headResult?.scripts) result.scripts.push(...headResult.scripts);
    } catch (error) {
      console.warn(`[getRouteHead] head() failed for ${match.routeId}:`, error);
    }
  }

  return result;
}

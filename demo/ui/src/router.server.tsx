import { QueryClientProvider } from "@tanstack/react-query";
import type { AnyRoute } from "@tanstack/react-router";
import { createMemoryHistory, createRouter as createTanStackRouter } from "@tanstack/react-router";
import { createRequestHandler, renderRouterToStream, RouterServer } from "@tanstack/react-router/ssr/server";
import { createRouter } from "./router";
import { routeTree } from "./routeTree.gen";
import type {
  HeadData,
  HeadLink,
  HeadMeta,
  HeadScript,
  RenderOptions,
  RenderResult,
  RouterContext,
} from "./types";

export { createRouter, routeTree } from "./router";
export type {
  ClientRuntimeConfig,
  CreateRouterOptions,
  HeadData,
  RenderOptions,
  RenderResult,
  RouterContext,
} from "./types";

function getMetaKey(meta: HeadMeta): string {
  if (!meta) return "null";
  if ("title" in meta) return "title";
  if ("charSet" in meta) return "charSet";
  if ("name" in meta) return `name:${(meta as { name: string }).name}`;
  if ("property" in meta) return `property:${(meta as { property: string }).property}`;
  if ("httpEquiv" in meta) return `httpEquiv:${(meta as { httpEquiv: string }).httpEquiv}`;
  return JSON.stringify(meta);
}

function getLinkKey(link: HeadLink): string {
  const rel = (link as { rel?: string }).rel ?? "";
  const href = (link as { href?: string }).href ?? "";
  return `${rel}:${href}`;
}

function getScriptKey(script: HeadScript): string {
  if (!script) return "null";
  if ("src" in script && script.src) return `src:${script.src}`;
  if ("children" in script && script.children) return `children:${typeof script.children === "string" ? script.children : JSON.stringify(script.children)}`;
  return JSON.stringify(script);
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

  const metaMap = new Map<string, HeadMeta>();
  const linkMap = new Map<string, HeadLink>();
  const scriptMap = new Map<string, HeadScript>();

  for (const match of matches) {
    const route = router.looseRoutesById[match.routeId] as AnyRoute | undefined;
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

      if (headResult?.meta) {
        for (const meta of headResult.meta) {
          metaMap.set(getMetaKey(meta), meta);
        }
      }
      if (headResult?.links) {
        for (const link of headResult.links) {
          linkMap.set(getLinkKey(link), link);
        }
      }
      if (headResult?.scripts) {
        for (const script of headResult.scripts) {
          scriptMap.set(getScriptKey(script), script);
        }
      }
    } catch (error) {
      console.warn(`[getRouteHead] head() failed for ${match.routeId}:`, error);
    }
  }

  return {
    meta: [...metaMap.values()],
    links: [...linkMap.values()],
    scripts: [...scriptMap.values()],
  };
}

export async function renderToStream(
  request: Request,
  options: RenderOptions
): Promise<RenderResult> {
  const url = new URL(request.url);
  const history = createMemoryHistory({ initialEntries: [url.pathname + url.search] });

  let queryClientRef: typeof import("@tanstack/react-query").QueryClient.prototype | null = null;

  const handler = createRequestHandler({
    request,
    createRouter: () => {
      const { router, queryClient } = createRouter({
        history,
        context: {
          assetsUrl: options.assetsUrl,
          runtimeConfig: options.runtimeConfig,
        },
      });
      queryClientRef = queryClient;
      return router;
    },
  });

  const response = await handler(({ request, responseHeaders, router }) =>
    renderRouterToStream({
      request,
      responseHeaders,
      router,
      children: (
        <QueryClientProvider client={queryClientRef!}>
          <RouterServer router={router} />
        </QueryClientProvider>
      ),
    }),
  );

  return {
    stream: response.body!,
    statusCode: response.status,
    headers: new Headers(response.headers),
  };
}

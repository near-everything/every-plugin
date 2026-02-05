import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory
} from "@tanstack/react-router";
import {
  createRequestHandler,
  renderRouterToStream,
  RouterServer,
} from "@tanstack/react-router/ssr/server";
import { createRouter } from "./router";
import type {
  HeadData,
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
  RouterContext
} from "./types";

export async function getRouteHead(
  pathname: string,
  context?: Partial<RouterContext>,
): Promise<HeadData> {
  const history = createMemoryHistory({ initialEntries: [pathname] });

  const { router } = createRouter({
    history,
    context: {
      assetsUrl: context?.assetsUrl ?? "",
      runtimeConfig: context?.runtimeConfig,
    },
  });

  const { collectHeadData } = await import("everything-dev/ui/router");
  return collectHeadData(router);
}

export async function renderToStream(
  request: Request,
  options: RenderOptions,
): Promise<RenderResult> {
  const url = new URL(request.url);
  const history = createMemoryHistory({
    initialEntries: [url.pathname + url.search],
  });

  let queryClientRef:
    | typeof import("@tanstack/react-query").QueryClient.prototype
    | null = null;

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

import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter, AnyRouteMatch, RouterHistory } from "@tanstack/react-router";

export interface ClientRuntimeConfig {
  env: string;
  title: string;
  hostUrl: string;
  apiBase: string;
  rpcBase: string;
}

export interface RouterContext {
  queryClient: QueryClient;
  assetsUrl: string;
  runtimeConfig?: ClientRuntimeConfig;
}

export interface CreateRouterOptions {
  history?: RouterHistory;
  context?: Partial<RouterContext>;
}

type HeadMeta = NonNullable<AnyRouteMatch["meta"]>[number];
type HeadLink = NonNullable<AnyRouteMatch["links"]>[number];
type HeadScript = NonNullable<AnyRouteMatch["headScripts"]>[number];

export interface HeadData {
  meta: HeadMeta[];
  links: HeadLink[];
  scripts: HeadScript[];
}

export interface DebugRouteMatch {
  routeId: string;
  params: Record<string, string>;
  hasHead: boolean;
  hasLoader: boolean;
  headType: string;
  loaderType: string;
}

export type RouterModule = {
  createRouter: (opts?: CreateRouterOptions) => {
    router: AnyRouter;
    queryClient: QueryClient;
  };
  getRouteHead: (
    pathname: string,
    context?: Partial<RouterContext>
  ) => Promise<HeadData>;
  debugMatchRoutes: (pathname: string) => DebugRouteMatch[];
  routeTree: AnyRouter["routeTree"];
};

export interface WindowRuntimeConfig {
  env: "development" | "production";
  title: string;
  hostUrl: string;
  ui: {
    name: string;
    url: string;
    exposes: Record<string, string>;
  };
  apiBase: string;
  rpcBase: string;
}

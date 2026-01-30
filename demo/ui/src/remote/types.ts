export type { Network } from "near-kit";

import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouteMatch, AnyRouter, RouterHistory } from "@tanstack/react-router";

export interface ClientRuntimeConfig {
  env: string;
  account: string;
  title: string;
  hostUrl?: string;
  assetsUrl: string;
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

export type HeadMeta = NonNullable<AnyRouteMatch["meta"]>[number];
export type HeadLink = NonNullable<AnyRouteMatch["links"]>[number];
export type HeadScript = NonNullable<AnyRouteMatch["headScripts"]>[number];

export interface HeadData {
  meta: HeadMeta[];
  links: HeadLink[];
  scripts: HeadScript[];
}

export interface RenderOptions {
  assetsUrl: string;
  runtimeConfig: ClientRuntimeConfig;
}

export interface RenderResult {
  stream: ReadableStream;
  statusCode: number;
  headers: Headers;
}

export interface RouterModule {
  createRouter: (opts?: CreateRouterOptions) => {
    router: AnyRouter;
    queryClient: QueryClient;
  };
  getRouteHead: (
    pathname: string,
    context?: Partial<RouterContext>
  ) => Promise<HeadData>;
  renderToStream: (
    request: Request,
    options: RenderOptions
  ) => Promise<RenderResult>;
  routeTree: AnyRouter["routeTree"];
}

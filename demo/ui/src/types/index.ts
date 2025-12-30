export type { Network } from "near-kit";
import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter, RouterHistory } from "@tanstack/react-router";

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

export type RouterModule = {
  createRouter: (opts?: CreateRouterOptions) => {
    router: AnyRouter;
    queryClient: QueryClient;
  };
};

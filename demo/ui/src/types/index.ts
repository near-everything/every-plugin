import type { ContractRouterClient } from "@orpc/contract";
import type { QueryClient } from "@tanstack/react-query";
import type { RouterHistory } from "@tanstack/react-router";
import type { contract } from "api";
import type { AuthSnapshot, HostRuntimeContext } from "everything-dev/runtime";
import type { RuntimeConfig } from "everything-dev/types";
import type { Network } from "near-kit";

export type { RuntimeConfig } from "everything-dev/types";
export type { Network } from "near-kit";

export type ApiContract = typeof contract;
export type ApiClient = ContractRouterClient<ApiContract>;

export type RouterContext = HostRuntimeContext<ApiClient, QueryClient> & {
	assetsUrl: string;
	network?: Network;
};

export type CreateRouterOptions = {
	history?: RouterHistory;
	context?: Partial<RouterContext>;
};

export type ClientRuntimeConfig = RuntimeConfig;

export type { AuthSnapshot };

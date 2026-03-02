import type { ContractRouterClient } from "@orpc/contract";
import type { contract } from "api";

export type ApiContract = typeof contract;
export type ApiClient = ContractRouterClient<ApiContract>;

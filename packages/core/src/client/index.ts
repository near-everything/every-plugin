import type { AnyContractRouter } from "@orpc/contract";
import {
  type ClientContext,
  type CreateProcedureClientOptions,
  createRouterClient,
  type ErrorMap,
  type InferRouterInitialContext,
  type Meta,
  type RouterClient,
  type Schema
} from "@orpc/server";
import type { AnyPlugin, InitializedPlugin, RouterOf } from "../types";

/**
 * Extracts the oRPC router from an initialized plugin.
 * The router type is precisely inferred from the plugin's contract.
 * Useful for mounting into HTTP frameworks or direct router usage.
 */
export function getPluginRouter<T extends AnyPlugin>(
  initialized: InitializedPlugin<T>
): RouterOf<T> & AnyContractRouter {
  if (!initialized) {
    throw new Error("InitializedPlugin is undefined - plugin initialization failed");
  }
  
  if (!initialized.plugin) {
    throw new Error("Plugin instance is undefined - check service layer dependencies (ModuleFederationService, SecretsService)");
  }
  
  if (typeof initialized.plugin.createRouter !== "function") {
    throw new Error(`Plugin ${initialized.metadata?.pluginId || 'unknown'} does not have a createRouter method`);
  }
  
  if (!initialized.context) {
    throw new Error("Plugin context is undefined - plugin initialization incomplete");
  }
  
  const router = initialized.plugin.createRouter(initialized.context);
  return router as RouterOf<T> & AnyContractRouter;
}

/**
 * Creates a fully type-safe client for calling plugin procedures as methods.
 * The client type is precisely inferred from the plugin's contract, providing
 * complete autocomplete and type safety for all procedures, inputs, and outputs.
 * 
 * Type safety flows: Plugin Contract → Router → RouterClient with full procedure autocomplete
 */
export function createPluginClient<
  T extends AnyPlugin,
  TClientContext extends ClientContext = Record<never, never>
>(
  initialized: InitializedPlugin<T>,
  options?: CreateProcedureClientOptions<
    InferRouterInitialContext<RouterOf<T>>,
    Schema<unknown, unknown>,
    ErrorMap,
    Meta,
    TClientContext
  >
): RouterClient<RouterOf<T>, TClientContext> {
  const router = getPluginRouter(initialized);
  return createRouterClient(router, options as CreateProcedureClientOptions<
    InferRouterInitialContext<RouterOf<T>>,
    Schema<unknown, unknown>,
    ErrorMap,
    Meta,
    TClientContext
  >) as RouterClient<RouterOf<T>, TClientContext>;
}

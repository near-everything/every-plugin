import { createRouterClient, type RouterClient } from "@orpc/server";
import type { AnyPlugin, InitializedPlugin, RouterOf } from "./types";

/**
 * Creates a typed client for calling plugin procedures as methods
 */
export function createPluginClient<T extends AnyPlugin>(
	initialized: InitializedPlugin<T>
): RouterClient<RouterOf<T>> {
	const router = getPluginRouter(initialized);
	return createRouterClient(router) as RouterClient<RouterOf<T>>;
}

/**
 * Helper to extract the oRPC router from an initialized plugin
 * Useful for mounting into HTTP frameworks like Hono/Elysia
 */
export function getPluginRouter<T extends AnyPlugin>(initialized: InitializedPlugin<T>) {
	return initialized.plugin.createRouter();
}

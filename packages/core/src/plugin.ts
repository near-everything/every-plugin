import type { AnyContractRouter } from "@orpc/contract";
import type { AnyRouter, Context, Router } from "@orpc/server";
import { Effect } from "effect";
import { z } from "zod";
import type { PluginConfigSchema } from "./runtime/types";

/**
 * Derive router type from contract at the type level
 */
type RouterFromContract<C extends AnyContractRouter, TContext extends Context = Record<never, never>> = Router<C, TContext>;

export function createConfigSchema(variablesSchema: z.ZodTypeAny, secretsSchema: z.ZodTypeAny): PluginConfigSchema {
	return z.object({
		variables: variablesSchema,
		secrets: secretsSchema
	}) as PluginConfigSchema;
}

/**
 * Common error schemas that all plugins can use
 * These provide consistent error handling across the plugin ecosystem
 */
export const CommonPluginErrors = {
	UNAUTHORIZED: {
		data: z.object({
			apiKeyProvided: z.boolean(),
			provider: z.string().optional(),
			authType: z.enum(['apiKey', 'oauth', 'token']).optional(),
		})
	},
	RATE_LIMITED: {
		data: z.object({
			retryAfter: z.number().int().min(1),
			remainingRequests: z.number().int().min(0).optional(),
			resetTime: z.string().datetime().optional(),
			limitType: z.enum(['requests', 'tokens', 'bandwidth']).optional(),
		})
	},
	SERVICE_UNAVAILABLE: {
		data: z.object({
			retryAfter: z.number().int().optional(),
			maintenanceWindow: z.boolean().default(false),
			estimatedUptime: z.string().datetime().optional(),
		})
	},
	BAD_REQUEST: {
		data: z.object({
			invalidFields: z.array(z.string()).optional(),
			validationErrors: z.array(z.object({
				field: z.string(),
				message: z.string(),
				code: z.string().optional(),
			})).optional(),
		})
	},
	NOT_FOUND: {
		data: z.object({
			resource: z.string().optional(),
			resourceId: z.string().optional(),
		})
	},
	FORBIDDEN: {
		data: z.object({
			requiredPermissions: z.array(z.string()).optional(),
			action: z.string().optional(),
		})
	}
};

/**
 * Plugin interface
 */
export interface Plugin<TContract extends AnyContractRouter, TConfigSchema extends PluginConfigSchema, TRouter extends AnyRouter = RouterFromContract<TContract>> {
	readonly id: string;
	readonly type: string;
	readonly contract: TContract;
	readonly configSchema: TConfigSchema;

	// Plugin lifecycle
	initialize(config: z.infer<TConfigSchema>): Effect.Effect<void, unknown, never>;
	shutdown(): Effect.Effect<void, never>;

	// Router creation - returns oRPC router implementation
	createRouter(): TRouter;
}

/**
 * Factory function to create plugins without requiring Effect knowledge
 * This is the new recommended way to create plugins
 */
export function createPlugin<
	TContract extends AnyContractRouter,
	TConfigSchema extends PluginConfigSchema,
	TContext extends Context = Record<never, never>,
	TRouter extends AnyRouter = RouterFromContract<TContract, TContext>
>(config: {
	id: string;
	type?: string;
	contract: TContract;
	configSchema: TConfigSchema;
	initialize?: (config: z.infer<TConfigSchema>) => Promise<TContext> | TContext;
	createRouter: (context: TContext) => TRouter;
}): new () => Plugin<TContract, TConfigSchema, TRouter> {

	class CreatedPlugin implements Plugin<TContract, TConfigSchema, TRouter> {
		readonly id = config.id;
		readonly type = config.type || "source";
		readonly contract = config.contract;
		readonly configSchema = config.configSchema;

		private _config: z.infer<TConfigSchema> | null = null;
		public _context: TContext = {} as TContext;

		initialize(pluginConfig: z.infer<TConfigSchema>): Effect.Effect<void, unknown, never> {
			const self = this;
			return Effect.gen(function* () {
				self._config = pluginConfig;

				if (config.initialize) {
					const result = config.initialize(pluginConfig);
					// Handle both sync and async initialize functions
					if (result instanceof Promise) {
						self._context = yield* Effect.tryPromise(() => result);
					} else {
						self._context = result;
					}
				}
			});
		}

		shutdown(): Effect.Effect<void, never> {
			return Effect.void;
		}

		createRouter() {
			return config.createRouter(this._context);
		}
	}

	return CreatedPlugin;
}

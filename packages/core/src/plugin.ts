import type { AnyContractRouter, AnySchema, InferSchemaOutput } from "@orpc/contract";
import type { Context, Implementer, Router } from "@orpc/server";
import { implement } from "@orpc/server";
import { Effect, type Scope } from "effect";
import { z } from "zod";


/**
 * Helper type that correctly constructs the config schema type
 */
export type PluginConfigFor<V extends AnySchema, S extends AnySchema> = {
	variables: V;
	secrets: S;
};

/**
 * Loaded plugin with static binding property
 */
export interface LoadedPluginWithBinding<
	TContract extends AnyContractRouter,
	TVariables extends AnySchema,
	TSecrets extends AnySchema,
	TContext extends Context = Record<never, never>
> {
	new(): Plugin<TContract, TVariables, TSecrets, TContext>;
	binding: {
		contract: TContract;
		variables: TVariables;
		secrets: TSecrets;
		config: PluginConfigFor<TVariables, TSecrets>;
		context: TContext;
	};
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
} as const;

/**
 * Plugin interface
 */
export interface Plugin<
	TContract extends AnyContractRouter,
	TVariables extends AnySchema,
	TSecrets extends AnySchema,
	TContext extends Context = Record<never, never>
> {
	readonly id: string;
	readonly contract: TContract;
	readonly configSchema: PluginConfigFor<TVariables, TSecrets>;

	// Plugin lifecycle
	initialize(
		config: { variables: InferSchemaOutput<TVariables>; secrets: InferSchemaOutput<TSecrets> }
	): Effect.Effect<TContext, unknown, Scope.Scope>;

	shutdown(): Effect.Effect<void, never>;

	/**
	 * Creates the strongly-typed oRPC router for this plugin.
	 * The router's procedure types are inferred directly from the contract.
	 * @param context The initialized plugin context
	 * @returns A router with procedures matching the plugin's contract
	 */
	createRouter(context: TContext): Router<TContract, any>;
}

/**
 * Factory function to create plugins
 */
export function createPlugin<
	V extends AnySchema,
	S extends AnySchema,
	TContract extends AnyContractRouter,
	TContext extends Context = Record<never, never>
>(config: {
	variables: V;
	secrets: S;
	contract: TContract;
	initialize?: (
		config: { variables: InferSchemaOutput<V>; secrets: InferSchemaOutput<S> }
	) => Effect.Effect<TContext, Error, Scope.Scope>;
	createRouter: (
		context: TContext,
		builder: Implementer<TContract, TContext, TContext>
	) => Router<TContract, any>;
	shutdown?: (ctx: TContext) => Effect.Effect<void, Error, never>;
}) {
	const configSchema: PluginConfigFor<V, S> = {
		variables: config.variables,
		secrets: config.secrets
	};

	class CreatedPlugin implements Plugin<TContract, V, S, TContext> {
		/** set during instantiation - registry key */
		id!: string;
		readonly contract = config.contract;
		readonly configSchema = configSchema;

		private _context: TContext | null = null;

		initialize(
			pluginConfig: { variables: InferSchemaOutput<V>; secrets: InferSchemaOutput<S> }
		): Effect.Effect<TContext, unknown, Scope.Scope> {
			const init = config.initialize ?? (() => Effect.succeed({} as TContext));

			return init(pluginConfig).pipe(
				Effect.tap((ctx) => Effect.sync(() => { this._context = ctx; })),
				Effect.map(() => this._context as TContext),
				Effect.mapError((error) => error as unknown)
			);
		}

		shutdown(): Effect.Effect<void, never> {
			const self = this;
			return Effect.gen(function* () {
				if (config.shutdown && self._context) {
					yield* config.shutdown(self._context).pipe(
						Effect.catchAll(() => Effect.void)
					);
				}
			});
		}

		createRouter(context: TContext): Router<TContract, any> {
			const builder = implement(config.contract).$context<TContext>();
			const router = config.createRouter(context, builder);
			return router as Router<TContract, any>;
		}
	}

	const PluginConstructor = CreatedPlugin as unknown as {
		new(): Plugin<TContract, V, S, TContext>;
		binding: {
			contract: TContract;
			variables: V;
			secrets: S;
			config: PluginConfigFor<V, S>;
			context: TContext;
		};
	};

	PluginConstructor.binding = {
		contract: config.contract,
		variables: config.variables,
		secrets: config.secrets,
		config: configSchema,
		context: {} as TContext
	};

	return PluginConstructor as LoadedPluginWithBinding<TContract, V, S, TContext>;
}

import type { AnyContractRouter, AnySchema, InferSchemaOutput } from "@orpc/contract";
import type { Context, Implementer, Router } from "@orpc/server";
import { implement } from "@orpc/server";
import { Effect, type Scope } from "effect";

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
		context: TContext;
	};
}

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
			context: TContext;
		};
	};

	PluginConstructor.binding = {
		contract: config.contract,
		variables: config.variables,
		secrets: config.secrets,
		context: {} as TContext
	};

	return PluginConstructor as LoadedPluginWithBinding<TContract, V, S, TContext>;
}

import type { AnyContractRouter, AnySchema, InferSchemaOutput } from "@orpc/contract";
import type { Context, Implementer, Router } from "@orpc/server";
import { implement } from "@orpc/server";
import { Effect, type Scope } from "effect";

type ContextOutput<T> = T extends AnySchema ? InferSchemaOutput<T> : {};

/**
 * Helper type that correctly constructs the config schema type
 */
export type PluginConfigFor<V extends AnySchema, S extends AnySchema, TRequestContext extends AnySchema | undefined> = {
	variables: V;
	secrets: S;
	context: TRequestContext;
};

/**
 * Loaded plugin with static binding property
 */
export interface LoadedPluginWithBinding<
	TContract extends AnyContractRouter,
	TVariables extends AnySchema,
	TSecrets extends AnySchema,
	TRequestContext extends AnySchema | undefined,
	TDeps extends Context = Record<never, never>
> {
	new(): Plugin<TContract, TVariables, TSecrets, TRequestContext, TDeps>;
	binding: {
		contract: TContract;
		variables: TVariables;
		secrets: TSecrets;
		context: TRequestContext;
	};
}

/**
 * Plugin interface
 */
export interface Plugin<
	TContract extends AnyContractRouter,
	TVariables extends AnySchema,
	TSecrets extends AnySchema,
	TRequestContext extends AnySchema | undefined,
	TDeps extends Context = Record<never, never>
> {
	readonly id: string;
	readonly contract: TContract;
	readonly configSchema: PluginConfigFor<TVariables, TSecrets, TRequestContext>;

	// Plugin lifecycle
	initialize(
		config: { variables: InferSchemaOutput<TVariables>; secrets: InferSchemaOutput<TSecrets> }
	): Effect.Effect<TDeps, unknown, Scope.Scope>;

	shutdown(): Effect.Effect<void, never>;

	/**
	 * Creates the strongly-typed oRPC router for this plugin.
	 * The router's procedure types are inferred directly from the contract.
	 * @param deps The initialized plugin dependencies
	 * @returns A router with procedures matching the plugin's contract
	 */
	createRouter(deps: TDeps): Router<TContract, any>;
}

/**
 * Factory function to create plugins
 */
export function createPlugin<
	V extends AnySchema,
	S extends AnySchema,
	TContract extends AnyContractRouter,
	TRequestContext extends AnySchema | undefined = undefined,
	TDeps extends Context = Record<never, never>
>(config: {
	variables: V;
	secrets: S;
	contract: TContract;
	context?: TRequestContext;
	initialize?: (
		config: { variables: InferSchemaOutput<V>; secrets: InferSchemaOutput<S> }
	) => Effect.Effect<TDeps, Error, Scope.Scope>;
	createRouter: (
		deps: TDeps,
		builder: Implementer<TContract, ContextOutput<TRequestContext>, ContextOutput<TRequestContext>>
	) => Router<TContract, any>;
	shutdown?: (deps: TDeps) => Effect.Effect<void, Error, never>;
}) {
	const configSchema: PluginConfigFor<V, S, TRequestContext> = {
		variables: config.variables,
		secrets: config.secrets,
		context: config.context as TRequestContext
	};

	class CreatedPlugin implements Plugin<TContract, V, S, TRequestContext, TDeps> {
		/** set during instantiation - registry key */
		id!: string;
		readonly contract = config.contract;
		readonly configSchema = configSchema;

		private _deps: TDeps | null = null;

		initialize(
			pluginConfig: { variables: InferSchemaOutput<V>; secrets: InferSchemaOutput<S> }
		): Effect.Effect<TDeps, unknown, Scope.Scope> {
			const init = config.initialize ?? (() => Effect.succeed({} as TDeps));

			return init(pluginConfig).pipe(
				Effect.tap((deps) => Effect.sync(() => { this._deps = deps; })),
				Effect.map(() => this._deps as TDeps),
				Effect.mapError((error) => error as unknown)
			);
		}

		shutdown(): Effect.Effect<void, never> {
			const self = this;
			return Effect.gen(function* () {
				if (config.shutdown && self._deps) {
					yield* config.shutdown(self._deps).pipe(
						Effect.catchAll(() => Effect.void)
					);
				}
			});
		}

		createRouter(deps: TDeps): Router<TContract, any> {
			const builder = implement(config.contract).$context<ContextOutput<TRequestContext>>();
			const router = config.createRouter(deps, builder);
			return router as Router<TContract, any>;
		}
	}

	const PluginConstructor = CreatedPlugin as unknown as {
		new(): Plugin<TContract, V, S, TRequestContext, TDeps>;
		binding: {
			contract: TContract;
			variables: V;
			secrets: S;
			context: TRequestContext;
		};
	};

	PluginConstructor.binding = {
		contract: config.contract,
		variables: config.variables,
		secrets: config.secrets,
		context: config.context as TRequestContext
	};

	return PluginConstructor as LoadedPluginWithBinding<TContract, V, S, TRequestContext, TDeps>;
}

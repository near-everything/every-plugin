import type { Effect } from "effect";
import { z } from "zod";
import type { ConfigurationError, PluginExecutionError } from "./errors";
import type { PluginLoggerTag } from "./plugin";

/**
 * Source-specific schema creators for contract-based plugins
 */
export function createSourceInputSchema<
	TContract,
	TStateSchema extends z.ZodTypeAny,
>(
	contract: TContract,
	stateSchema: TStateSchema,
) {
	const contractEntries = Object.entries(contract as Record<string, any>);

	const procedureSchemas = contractEntries.map(([procedureName, procedureSpec]) => {
		// Extract input schema from oRPC contract procedure
		const inputSchema = procedureSpec['~orpc']?.inputSchema || z.object({});

		return z.object({
			procedure: z.literal(procedureName),
			input: inputSchema,
			state: stateSchema,
		});
	});

	return z.discriminatedUnion("procedure", procedureSchemas as [z.ZodObject<any>, ...z.ZodObject<any>[]]);
}

/**
 * Contract-based output schema creator that infers from oRPC contract
 */
export function createSourceOutputSchema<
	TContract,
	TStateSchema extends z.ZodTypeAny,
>(
	contract: TContract,
	stateSchema: TStateSchema,
) {
	const contractEntries = Object.entries(contract as Record<string, any>);

	const procedureOutputSchemas = contractEntries.map(([_, procedureSpec]) => {
		// Extract output schema from oRPC contract procedure
		const baseOutputSchema = procedureSpec['~orpc']?.outputSchema || z.object({});

		// Extend the base output schema with optional state for streaming
		return baseOutputSchema.extend({
			nextState: stateSchema,
		});
	});

	// Return union of all procedure output schemas
	return z.union(procedureOutputSchemas as [z.ZodTypeAny, ...z.ZodTypeAny[]]);
}

/**
 * Contract-first source plugin interface following the Plugin pattern
 */
export interface SourcePlugin<
	TContract = Record<string, any>,
	TConfigSchema extends z.ZodTypeAny = z.ZodTypeAny,
	TStateSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
	readonly id: string;
	readonly type: "source";
	readonly contract: TContract;
	readonly configSchema: TConfigSchema;
	readonly stateSchema: TStateSchema;
	readonly inputSchema: ReturnType<typeof createSourceInputSchema<TContract, TStateSchema>>;
	readonly outputSchema: z.ZodTypeAny; // Contract-derived output schema

	initialize(
		config?: z.infer<TConfigSchema>,
	): Effect.Effect<void, ConfigurationError, PluginLoggerTag>;

	execute(
		input: z.infer<this['inputSchema']>,
	): Effect.Effect<any, PluginExecutionError, PluginLoggerTag>;

	shutdown(): Effect.Effect<void, never, PluginLoggerTag>;

	createRouter(): any; // Returns oRPC router
}

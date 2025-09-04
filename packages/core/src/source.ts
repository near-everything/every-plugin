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
		// Extract input and output schemas from oRPC contract procedure
		const inputSchema = procedureSpec['~orpc']?.inputSchema || z.object({});
		const outputSchema = procedureSpec['~orpc']?.outputSchema || z.object({});
		
		// Check if this procedure is streamable (has nextState in output)
		const isStreamable = outputSchema._def?.shape?.nextState !== undefined;
		
		const baseSchema = z.object({
			procedure: z.literal(procedureName),
			input: inputSchema,
		});
		
		// Only add state field for streamable procedures
		return isStreamable 
			? baseSchema.extend({ state: stateSchema })
			: baseSchema;
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
		return procedureSpec['~orpc']?.outputSchema || z.object({});
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
	readonly outputSchema: ReturnType<typeof createSourceOutputSchema<TContract, TStateSchema>>;

	initialize(
		config?: z.infer<TConfigSchema>,
	): Effect.Effect<void, ConfigurationError, PluginLoggerTag>;

	execute(
		input: z.infer<this['inputSchema']>,
	): Effect.Effect<z.infer<this['outputSchema']>, PluginExecutionError, PluginLoggerTag>;

	shutdown(): Effect.Effect<void, never, PluginLoggerTag>;

	createRouter(): any; // Returns oRPC router
	
	isStreamable(procedureName: string): boolean;
}

import { Context, Effect } from "effect";
import { z } from "zod";
import type { ConfigurationError } from "./errors";

export function createConfigSchema<
	V extends z.ZodTypeAny = z.ZodRecord<z.ZodString, z.ZodUnknown>,
	S extends z.ZodTypeAny = z.ZodRecord<z.ZodString, z.ZodUnknown>,
>(variablesSchema?: V, secretsSchema?: S) {
	return z.object({
		variables: variablesSchema ? variablesSchema.optional() : z.record(z.string(), z.unknown()).optional(),
		secrets: secretsSchema ? secretsSchema.optional() : z.record(z.string(), z.unknown()).optional(),
	});
}

export function createStateSchema<T extends z.ZodTypeAny>(
	pluginStateSchema: T,
) {
	const BaseStreamingStateSchema = z.object({
		nextPollMs: z.number().nullable().optional(), // null = terminate, undefined/0 = no delay, number = delay ms
	});

	return BaseStreamingStateSchema.and(pluginStateSchema);
}

// Plugin types
export type PluginType = "transformer" | "distributor" | "source";

// Plugin metadata for registry
export interface PluginMetadata {
	remoteUrl: string;
	type?: PluginType;
	version?: string;
	description?: string;
}

export interface PluginRegistry {
	[pluginId: string]: PluginMetadata;
}

// Logger interface
export interface PluginLogger {
	readonly logInfo: (message: string, context?: unknown) => Effect.Effect<void>;
	readonly logWarning: (
		message: string,
		context?: unknown,
	) => Effect.Effect<void>;
	readonly logError: (
		message: string,
		error?: unknown,
		context?: unknown,
	) => Effect.Effect<void>;
	readonly logDebug: (
		message: string,
		context?: unknown,
	) => Effect.Effect<void>;
}

export class PluginLoggerTag extends Context.Tag("PluginLogger")<
	PluginLoggerTag,
	PluginLogger
>() { }

/**
 * Schema creators for contract-based plugins
 */
export function createPluginInputSchema<
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

export function createPluginOutputSchema<
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
 * Unified Plugin interface for all plugin types
 */
export interface Plugin<
	TContract = Record<string, any>,
	TConfigSchema extends z.ZodTypeAny = z.ZodTypeAny,
	TStateSchema extends z.ZodTypeAny = z.ZodNull,
> {
	readonly id: string;
	readonly type: PluginType;
	readonly contract: TContract;
	readonly configSchema: TConfigSchema;
	readonly stateSchema: TStateSchema;
	readonly inputSchema: ReturnType<typeof createPluginInputSchema<TContract, TStateSchema>>;
	readonly outputSchema: ReturnType<typeof createPluginOutputSchema<TContract, TStateSchema>>;

	initialize(
		config?: z.infer<TConfigSchema>,
	): Effect.Effect<void, ConfigurationError, PluginLoggerTag>;

	shutdown(): Effect.Effect<void, never, PluginLoggerTag>;

	createRouter(): any; // Returns oRPC router

	isStreamable(procedureName: string): boolean;
}

/**
 * State transition utilities for plugins
 * These provide a functional approach to state updates while keeping the API simple
 */
export const StateTransitions = {
	/**
	 * Transition to a new phase with optional updates
	 */
	to: <T extends { phase?: string }>(phase: string, updates: Partial<T> = {}) =>
		(state: T): T => ({ ...state, phase, ...updates }),

	/**
	 * Add polling delay to state
	 */
	withPolling: <T>(delayMs: number) =>
		(state: T): T => ({ ...state, nextPollMs: delayMs }),

	/**
	 * Set error state with message and stop polling
	 */
	withError: <T>(errorMessage: string) =>
		(state: T): T => ({
			...state,
			phase: 'error',
			errorMessage,
			nextPollMs: null
		}),

	/**
	 * Preserve existing state with updates
	 */
	update: <T>(updates: Partial<T>) =>
		(state: T): T => ({ ...state, ...updates }),
};

/**
 * Simple pipe utility for composing state transformations
 */
export const pipe = <T>(value: T, ...fns: Array<(val: T) => T>): T =>
	fns.reduce((acc, fn) => fn(acc), value);

/**
 * Simple plugin base class that uses pure oRPC patterns
 * Plugin just needs to define contract, config, and create oRPC router
 */
export abstract class SimplePlugin<
	TContract,
	TConfigSchema extends z.ZodTypeAny,
	TStateSchema extends z.ZodTypeAny = z.ZodNull
> implements Plugin<TContract, TConfigSchema, TStateSchema> {
	abstract readonly id: string;
	abstract readonly type: PluginType;
	abstract readonly contract: TContract;
	abstract readonly configSchema: TConfigSchema;

	readonly stateSchema = z.null() as unknown as TStateSchema;

	// Auto-generated schemas
	get inputSchema() {
		return createPluginInputSchema(this.contract, this.stateSchema);
	}

	get outputSchema() {
		return createPluginOutputSchema(this.contract, this.stateSchema);
	}

	// Default implementations - runtime handles validation
	initialize(config?: z.infer<TConfigSchema>): Effect.Effect<void, ConfigurationError, PluginLoggerTag> {
		return Effect.void;
	}

	// Plugin implements this to return pure oRPC router following oRPC docs pattern
	abstract createRouter(): any; // Returns oRPC router directly

	shutdown(): Effect.Effect<void, never, PluginLoggerTag> {
		return Effect.void;
	}

	// Default streamable detection
	isStreamable(procedureName: string): boolean {
		const contractEntries = Object.entries(this.contract as Record<string, any>);
		const procedure = contractEntries.find(([name]) => name === procedureName);
		if (!procedure) return false;

		const outputSchema = procedure[1]['~orpc']?.outputSchema;
		return outputSchema?._def?.shape?.nextState !== undefined;
	}
}

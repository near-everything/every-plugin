import { Duration, Effect, Option, Stream } from "effect";
import type { z } from "zod";
import type { SourcePlugin } from "../source";
import type { PluginRuntimeError } from "./errors";
import type { InitializedPlugin } from "./types";
import { validate } from "./validation";

/**
 * Helper to safely extract items from plugin result based on contract
 */
const extractItemsFromResult = <TItem>(result: unknown): TItem[] => {
	if (!result || typeof result !== 'object') {
		return [];
	}

	const resultObj = result as Record<string, unknown>;

	// Handle array response (search, getBulk)
	if (Array.isArray(resultObj.items)) {
		return resultObj.items as TItem[];
	}

	// Handle single item response (getById)
	if (resultObj.item && typeof resultObj.item === 'object') {
		return [resultObj.item as TItem];
	}

	return [];
};

/**
 * Helper to safely extract next state/cursor from plugin result
 */
const extractNextState = <TState>(result: unknown, currentState: TState | null): TState | null => {
	if (!result || typeof result !== 'object') {
		return currentState;
	}

	const resultObj = result as Record<string, unknown>;

	// Prefer nextCursor for pagination
	if (typeof resultObj.nextCursor === 'string') {
		return resultObj.nextCursor as TState;
	}

	// Fall back to nextState
	if (resultObj.nextState !== undefined) {
		return resultObj.nextState as TState;
	}

	return currentState;
};

/**
 * Context information about the streaming operation (immutable metadata)
 */
export interface StreamingContext {
	readonly pluginId: string;
	readonly startedAt: Date;
	readonly iteration: {
		readonly count: number;
		readonly itemsProcessed: number;
		readonly lastExecutionAt: Date;
		readonly lastDuration?: Duration.Duration;
	};
}

/**
 * Mutable state that flows between plugin executions
 */
export interface StreamingState<TState = unknown> {
	lastProcessedState: TState | null;
	shouldStop: boolean;
}

/**
 * Options for configuring source plugin streaming
 */
export interface SourceStreamOptions<TItem = unknown, TState = unknown> {
	pollInterval?: Duration.Duration;
	maxItems?: number;
	maxIterations?: number;
	stopWhenEmpty?: boolean;
	stopCondition?: (item: TItem, context: StreamingContext, state: StreamingState<TState>) => boolean;
	continueOnError?: boolean;

	// Callbacks with proper context and state separation
	onStateChange?: (state: StreamingState<TState>, context: StreamingContext) => Effect.Effect<void, never>;
	onItems?: (items: TItem[], context: StreamingContext, state: StreamingState<TState>) => Effect.Effect<void, never>;
	onError?: (error: PluginRuntimeError, context: StreamingContext, state: StreamingState<TState>) => Effect.Effect<void, never>;
	onIterationComplete?: (context: StreamingContext, state: StreamingState<TState>) => Effect.Effect<void, never>;
}

/**
 * Internal state used by the stream implementation
 */
interface InternalStreamState<TState = unknown> {
	streamingState: StreamingState<TState>;
	context: StreamingContext;
}

/**
 * Check if streaming should stop based on options and current state
 */
const shouldStopStreaming = <TItem, TState>(
	internalState: InternalStreamState<TState>,
	options: SourceStreamOptions<TItem, TState>,
	items: TItem[] = []
): boolean => {
	const { context, streamingState } = internalState;

	// Check explicit stop flag
	if (streamingState.shouldStop) {
		return true;
	}

	// Check max iterations
	if (options.maxIterations && context.iteration.count >= options.maxIterations) {
		return true;
	}

	// Check max items
	if (options.maxItems && context.iteration.itemsProcessed >= options.maxItems) {
		return true;
	}

	// Check stop when empty
	if (options.stopWhenEmpty && items.length === 0) {
		return true;
	}

	// Check custom stop condition for each item
	if (options.stopCondition) {
		return items.some(item => options.stopCondition!(item, context, streamingState));
	}

	return false;
};

/**
 * Update context with new iteration information
 */
const updateContext = (
	context: StreamingContext,
	itemsCount: number,
	executionDuration?: Duration.Duration
): StreamingContext => ({
	...context,
	iteration: {
		count: context.iteration.count + 1,
		itemsProcessed: context.iteration.itemsProcessed + itemsCount,
		lastExecutionAt: new Date(),
		lastDuration: executionDuration,
	},
});

/**
 * Create a stream from a source plugin with state management and context tracking
 */
export const createSourceStream = <
	T extends SourcePlugin,
	TInput extends z.infer<T["inputSchema"]> = z.infer<T["inputSchema"]>,
	TItem = unknown,
	TState = unknown
>(
	pluginId: string,
	initializedPlugin: InitializedPlugin<T>,
	executePlugin: (plugin: InitializedPlugin<T>, input: TInput) => Effect.Effect<z.infer<T["outputSchema"]>, PluginRuntimeError>,
	input: TInput,
	options: SourceStreamOptions<TItem, TState> = {}
): Stream.Stream<TItem, PluginRuntimeError> => {
	const startTime = new Date();

	const initialContext: StreamingContext = {
		pluginId,
		startedAt: startTime,
		iteration: {
			count: 0,
			itemsProcessed: 0,
			lastExecutionAt: startTime,
		},
	};

	const initialStreamingState: StreamingState<TState> = {
		lastProcessedState: (input.state ?? null) as TState | null,
		shouldStop: false,
	};

	const initialInternalState: InternalStreamState<TState> = {
		context: initialContext,
		streamingState: initialStreamingState,
	};

	return Stream.unfoldEffect(
		initialInternalState,
		(internalState) => Effect.gen(function* () {
			const { context, streamingState } = internalState;

			// Check stop conditions before execution
			if (shouldStopStreaming(internalState, options)) {
				return Option.none();
			}

			const executionStart = new Date();

			// Execute plugin with current state
			const pluginInput = {
				...input,
				state: streamingState.lastProcessedState,
			};

			const result = yield* executePlugin(initializedPlugin, pluginInput).pipe(
				Effect.catchAll((error: PluginRuntimeError) => Effect.gen(function* () {
					// Call error callback if provided
					if (options.onError) {
						yield* options.onError(error, context, streamingState);
					}

					if (options.continueOnError) {
						// Return empty result to continue streaming
						return {
							items: [],
							nextCursor: undefined,
							nextState: streamingState.lastProcessedState,
						};
					} else {
						// Re-throw error to stop streaming
						return yield* Effect.fail(error);
					}
				}))
			);

			const executionEnd = new Date();
			const executionDuration = Duration.millis(executionEnd.getTime() - executionStart.getTime());

			// Extract items from plugin result
			const items = extractItemsFromResult<TItem>(result);

			// Extract next state/cursor for pagination
			const nextState = extractNextState<TState>(result, streamingState.lastProcessedState);

			// Early return if no items and stopWhenEmpty is true
			if (options.stopWhenEmpty && items.length === 0) {
				return Option.none();
			}

			// Update context and state
			const newContext = updateContext(context, items.length, executionDuration);
			const newStreamingState: StreamingState<TState> = {
				lastProcessedState: nextState,
				shouldStop: streamingState.shouldStop,
			};

			const newInternalState: InternalStreamState<TState> = {
				context: newContext,
				streamingState: newStreamingState,
			};

			// Call callbacks
			if (options.onItems && items.length > 0) {
				yield* options.onItems(items, newContext, newStreamingState);
			}

			if (options.onStateChange && nextState !== streamingState.lastProcessedState) {
				yield* options.onStateChange(newStreamingState, newContext);
			}

			if (options.onIterationComplete) {
				yield* options.onIterationComplete(newContext, newStreamingState);
			}

			// Check stop conditions after processing
			if (shouldStopStreaming(newInternalState, options, items)) {
				// Return the items we have, then stop
				if (items.length > 0) {
					return Option.some([items, newInternalState]);
				}
				return Option.none();
			}

			// Schedule next iteration if we have a poll interval and no items
			if (options.pollInterval && items.length === 0) {
				yield* Effect.sleep(options.pollInterval);
			}

			// Return items and continue streaming
			return Option.some([items, newInternalState]);
		})
	).pipe(
		Stream.flatMap(items => Stream.fromIterable(items)),
		options.maxItems ? Stream.take(options.maxItems) : Stream.identity
	);
};

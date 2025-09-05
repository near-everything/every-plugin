import { Duration, Effect, Option, Stream } from "effect";
import type { z } from "zod";
import type { Plugin } from "../plugin";
import type { PluginRuntimeError } from "./errors";
import type { InitializedPlugin } from "./types";


export interface SourceStreamOptions<TItem = unknown> {
	maxItems?: number;
	maxInvocations?: number;
	stopWhenEmpty?: boolean;
}

const extractDelayFromState = (state: any): Duration.Duration | null => {
	return state?.nextPollMs ? Duration.millis(state.nextPollMs) : null;
};

/**
 * Create a stream from a source plugin
 * Note: Validation is handled at the runtime level before this function is called
 */
export const createSourceStream = <
	T extends Plugin,
	TInput extends z.infer<T["inputSchema"]>,
	TItem
>(
	initializedPlugin: InitializedPlugin<T>,
	executePlugin: (plugin: InitializedPlugin<T>, input: TInput) => Effect.Effect<any, PluginRuntimeError>,
	input: TInput,
	options: SourceStreamOptions<TItem> = {},
): Stream.Stream<TItem, PluginRuntimeError> => {
	const initialState = (input as z.infer<T["inputSchema"]>).state;

	const stream = Stream.unfoldEffect({ state: initialState, invocations: 0 }, ({ state: currentState, invocations }) =>
		Effect.gen(function* () {
			console.log(`[STREAM] Invocation ${invocations}:`);
			console.log(`[STREAM] - Current state:`, JSON.stringify(currentState, null, 2));
			console.log(`[STREAM] - Input:`, JSON.stringify(input, null, 2));

			// Check invocation limit if specified
			if (options.maxInvocations && invocations >= options.maxInvocations) {
				console.log(`[STREAM] - Stopping: maxInvocations (${options.maxInvocations}) reached`);
				return Option.none();
			}

			// Extract timing from plugin state (nextPollMs)
			const nextDelay = extractDelayFromState(currentState);
			if (nextDelay) {
				yield* Effect.sleep(nextDelay);
			}

			// Execute plugin
			const pluginInput = { ...input as object, state: currentState ?? null } as TInput;
			console.log(`[STREAM] - Plugin input:`, JSON.stringify(pluginInput, null, 2));

			const result = yield* executePlugin(initializedPlugin, pluginInput);
			const resultObj = result as Record<string, unknown>;
			const items: TItem[] = Array.isArray(resultObj.items)
				? resultObj.items as TItem[]
				: [];
			const nextState = resultObj.nextState;

			console.log(`[STREAM] - Plugin output:`, JSON.stringify(resultObj, null, 2));
			console.log(`[STREAM] - Items count: ${items.length}`);
			console.log(`[STREAM] - Next state:`, JSON.stringify(nextState, null, 2));

			// Check stop conditions ONLY
			if (options.stopWhenEmpty && items.length === 0) {
				console.log(`[STREAM] - Stopping: stopWhenEmpty=true and items.length=0`);
				return Option.none();
			}

			console.log(`[STREAM] - Continuing to next iteration`);
			return Option.some([items, { state: nextState, invocations: invocations + 1 }]);
		})
	).pipe(
		// Flatten items from each iteration
		Stream.flatMap(items => Stream.fromIterable(items))
	);

	// Apply maxItems limit if specified
	return options.maxItems ? stream.pipe(Stream.take(options.maxItems)) : stream;
};

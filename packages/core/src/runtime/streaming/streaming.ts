import { Duration, Effect, Option, Ref, Stream } from "effect";
import type { z } from "zod";
import type { Plugin } from "../../plugin";
import type { PluginRuntimeError } from "../errors";
import type { InitializedPlugin } from "../types";
import type { StreamingOptions, StreamState } from "./types";

/**
 * Plugin execution result interface
 */
interface PluginExecutionResult<TItem, TPluginState> {
  items: TItem[];
  nextState: TPluginState;
}

/**
 * Extract delay from plugin state (nextPollMs field)
 */
const extractDelayFromState = <TPluginState>(state: TPluginState): Duration.Duration | null => {
  const stateWithPolling = state as TPluginState & { nextPollMs?: number };
  return stateWithPolling?.nextPollMs ? Duration.millis(stateWithPolling.nextPollMs) : null;
};

export const createSourceStream = <
  T extends Plugin,
  TInput extends z.infer<T["inputSchema"]>,
  TItem,
  TPluginState extends z.infer<T["stateSchema"]>
>(
  initializedPlugin: InitializedPlugin<T>,
  executePlugin: (plugin: InitializedPlugin<T>, input: TInput) => Effect.Effect<PluginExecutionResult<TItem, TPluginState>, PluginRuntimeError>,
  input: TInput,
  options: StreamingOptions<TItem, TPluginState> = {},
): Stream.Stream<TItem, PluginRuntimeError> => {

  // Create initial stream state with plugin's initial state
  const initialStreamState: StreamState<TPluginState> = {
    invocations: 0,
    pluginState: (input as z.infer<T["inputSchema"]>).state as TPluginState,
    lastItemCount: 0,
  };

  return Stream.fromEffect(
    Ref.make(initialStreamState)
  ).pipe(
    Stream.flatMap(stateRef =>
      Stream.unfoldEffect(null, () =>
        Effect.gen(function* () {
          // Get current stream state atomically
          const currentStreamState = yield* Ref.get(stateRef);

          // Check invocation limit
          if (options.maxInvocations && currentStreamState.invocations >= options.maxInvocations) {
            return Option.none();
          }

          // Extract timing from plugin state and sleep if needed
          const nextDelay = extractDelayFromState(currentStreamState.pluginState);
          if (nextDelay) {
            yield* Effect.sleep(nextDelay);
          }

          // Execute plugin with current plugin state
          const pluginInput = {
            ...input as object,
            state: currentStreamState.pluginState ?? null
          } as TInput;

          const result = yield* executePlugin(initializedPlugin, pluginInput);
          const items: TItem[] = result.items;
          const nextPluginState = result.nextState;

          // Update stream state atomically
          const newStreamState: StreamState<TPluginState> = {
            invocations: currentStreamState.invocations + 1,
            pluginState: nextPluginState as TPluginState,
            lastItemCount: items.length,
          };

          yield* Ref.set(stateRef, newStreamState);

          // Call state change hook if provided
          if (options.onStateChange) {
            yield* options.onStateChange(nextPluginState as TPluginState, items);
          }

          return Option.some([items, null]);
        })
      )
    ),
    // Flatten items from each iteration
    Stream.flatMap(items => Stream.fromIterable(items)),
    // Apply maxItems limit if specified
    options.maxItems ? Stream.take(options.maxItems) : Stream.identity
  );
};

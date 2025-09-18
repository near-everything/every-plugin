import { Duration, Effect, Stream } from "effect";
import type { z } from "zod";
import type { Contract, Plugin } from "../../plugin";
import { type PluginRuntimeError, toPluginRuntimeError } from "../errors";
import type { InitializedPlugin } from "../types";
import type { StreamingOptions, StreamState } from "./types";

/**
 * Extract delay from plugin state (nextPollMs field)
 * Returns null if nextPollMs is null (signals termination) or undefined (no delay specified)
 */
const extractDelayFromState = <TPluginState>(state: TPluginState): Duration.Duration | null => {
  const stateWithPolling = state as TPluginState & { nextPollMs?: number | null };
  if (stateWithPolling?.nextPollMs === null) {
    return null; // Explicit termination signal
  }
  return stateWithPolling?.nextPollMs ? Duration.millis(stateWithPolling.nextPollMs) : null;
};

/**
 * Check if plugin state signals stream termination
 */
const isTerminalState = <TPluginState>(state: TPluginState): boolean => {
  const stateWithPolling = state as TPluginState & { nextPollMs?: number | null };
  return stateWithPolling?.nextPollMs === null;
};

export const createSourceStream = <
  T extends Plugin<Contract>,
  TInput extends z.infer<T["inputSchema"]>,
  TItem,
  TPluginState extends z.infer<T["stateSchema"]>
>(
  initializedPlugin: InitializedPlugin<T>,
  executePlugin: (plugin: InitializedPlugin<T>, input: TInput) => Effect.Effect<z.infer<T["outputSchema"]>, PluginRuntimeError>,
  input: TInput,
  options: StreamingOptions<TItem, TPluginState> = {},
): Stream.Stream<TItem, PluginRuntimeError> => {

  // Create initial stream state with plugin's initial state
  const initialStreamState: StreamState<TPluginState> = {
    invocations: 0,
    pluginState: (input as z.infer<T["inputSchema"]>).state as TPluginState,
    lastItemCount: 0,
  };

  // Use Stream.async for full control over emission timing and delays
  return Stream.async<TItem, PluginRuntimeError>((emit) => {
    let currentStreamState = initialStreamState;
    let totalItemsEmitted = 0;

    const loop = async () => {
      try {
        while (true) {
          console.log(`[STREAMING] Starting iteration ${currentStreamState.invocations + 1}`);

          // Check invocation limit BEFORE executing
          if (options.maxInvocations && currentStreamState.invocations >= options.maxInvocations) {
            console.log(`[STREAMING] Reached maxInvocations limit: ${options.maxInvocations}`);
            break;
          }

          // Check maxItems limit BEFORE executing
          if (options.maxItems && totalItemsEmitted >= options.maxItems) {
            console.log(`[STREAMING] Reached maxItems limit: ${options.maxItems}`);
            break;
          }

          // Execute plugin with current plugin state
          const pluginInput = {
            ...input as object,
            state: currentStreamState.pluginState ?? null
          } as TInput;

          console.log(`[STREAMING] About to execute plugin with input:`, JSON.stringify(pluginInput, null, 2));
          console.log(`[STREAMING] Plugin state:`, JSON.stringify(currentStreamState.pluginState, null, 2));

          const rawResult = await Effect.runPromise(
            executePlugin(initializedPlugin, pluginInput).pipe(
              Effect.catchAll((error) => {
                return toPluginRuntimeError(error);
              })
            )
          );

          console.log(`[STREAMING] Plugin execution completed`);

          // Transform raw plugin result to streaming format
          const resultObj = rawResult as Record<string, unknown>;
          const items: TItem[] = Array.isArray(resultObj.items) ? resultObj.items as TItem[] : [];
          const nextPluginState = resultObj.nextState as TPluginState;

          console.log(`[STREAMING] Transformed result: ${items.length} items`);

          // Update stream state (increment AFTER execution)
          currentStreamState = {
            invocations: currentStreamState.invocations + 1,
            pluginState: nextPluginState as TPluginState,
            lastItemCount: items.length,
          };

          console.log(`[STREAMING] Invocation ${currentStreamState.invocations}, Items: ${items.length}`);

          // Call state change hook if provided
          if (options.onStateChange) {
            await Effect.runPromise(
              options.onStateChange(nextPluginState as TPluginState, items).pipe(
                Effect.catchAll((error) => {
                  console.warn(`[STREAMING] onStateChange failed:`, error);
                  return Effect.void;
                })
              )
            );
          }

          // Emit items immediately (before any delays)
          for (const item of items) {
            if (options.maxItems && totalItemsEmitted >= options.maxItems) {
              console.log(`[STREAMING] Stopping emission at maxItems limit: ${options.maxItems}`);
              break;
            }
            emit.single(item);
            totalItemsEmitted++;
          }

          // Check for termination conditions
          if (nextPluginState && isTerminalState(nextPluginState)) {
            console.log(`[STREAMING] Plugin signaled termination`);
            break;
          }

          // Check stopWhenEmpty condition
          if (options.stopWhenEmpty && items.length === 0) {
            console.log(`[STREAMING] Stopping due to empty result and stopWhenEmpty=true`);
            break;
          }

          // Handle delay AFTER emission, BEFORE next iteration
          const nextDelay = extractDelayFromState(nextPluginState);
          if (nextDelay && Duration.toMillis(nextDelay) > 0) {
            console.log(`[STREAMING] Sleeping for ${Duration.toMillis(nextDelay)}ms before next iteration`);
            await Effect.runPromise(Effect.sleep(nextDelay));
          }
        }

        // End the stream
        emit.end();
      } catch (error) {
        console.log(`[STREAMING] Error occurred:`, error);
        emit.fail(error as PluginRuntimeError);
      }
    };

    // Start the loop
    loop();
  });
};

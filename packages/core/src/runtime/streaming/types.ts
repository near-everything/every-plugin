import type { Effect } from "effect";

/**
 * Internal stream state managed by the runtime
 */
export interface StreamState<TPluginState> {
  readonly invocations: number;
  readonly pluginState: TPluginState;
  readonly lastItemCount: number;
}

/**
 * Enhanced streaming options with Effect-based hooks
 */
export interface StreamingOptions<TItem = unknown, TPluginState = unknown> {
  maxItems?: number;
  maxInvocations?: number;
  stopWhenEmpty?: boolean;
  
  // State change hook for persistence and observability
  onStateChange?: (newPluginState: TPluginState, items: TItem[]) => Effect.Effect<void, Error>;
}

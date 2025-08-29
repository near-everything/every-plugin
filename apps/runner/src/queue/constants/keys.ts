import type { PluginRun, WorkflowError, WorkflowRunInfo } from '@usersdotfun/shared-types/types';

/**
 * A type-safe representation of a Redis key.
 * The `_value` property is a "phantom type" used solely for type inference
 * and does not exist at runtime.
 */
export type RedisKey<T> = {
  readonly __type: 'RedisKey';
  readonly value: string;
  readonly _value: T;
};

// ============================================================================
// Redis Key Factories for specific data types
// These functions enforce consistent key naming and associate them with data types.
// ============================================================================

export const RedisKeys = {
  /**
   * The channel name for broadcasting WebSocket events.
   */
  webSocketEventsChannel: (): RedisKey<string> => ({
    __type: 'RedisKey',
    value: 'websocket-events',
    _value: undefined as unknown as string,
  }),

  /**
   * Key for a workflow's resumable state (e.g., for source cursors).
   * Example: `workflow:WORKFLOW_ID:state`
   */
  workflowState: <T>(workflowId: string): RedisKey<T> => ({
    __type: 'RedisKey',
    value: `workflow:${workflowId}:state`,
    _value: undefined as T,
  }),

  /**
   * Key for a specific workflow run's real-time summary information.
   * Example: `workflow:WORKFLOW_ID:run:RUN_ID`
   */
  runSummary: (workflowId: string, runId: string): RedisKey<WorkflowRunInfo> => ({
    __type: 'RedisKey',
    value: `workflow:${workflowId}:run:${runId}`,
    _value: undefined as unknown as WorkflowRunInfo,
  }),

  /**
   * Key for the list of recent run IDs for a given workflow. (Redis List)
   * Example: `workflow:WORKFLOW_ID:runs:history`
   */
  workflowRunHistory: (workflowId: string): RedisKey<string[]> => ({
    __type: 'RedisKey',
    value: `workflow:${workflowId}:runs:history`,
    _value: undefined as unknown as string[],
  }),

  /**
   * Key for the real-time state of a single plugin execution for a specific item.
   * Example: `run:RUN_ID:item:ITEM_ID:step:STEP_ID`
   */
  pluginRunState: (runId: string, itemId: string, stepId: string): RedisKey<PluginRun> => ({
    __type: 'RedisKey',
    value: `run:${runId}:item:${itemId}:step:${stepId}`,
    _value: undefined as unknown as PluginRun,
  }),

  /**
   * Key for storing the last known error for a workflow.
   * Example: `workflow-error:WORKFLOW_ID`
   */
  workflowError: (workflowId: string): RedisKey<WorkflowError> => ({
    __type: 'RedisKey',
    value: `workflow-error:${workflowId}`,
    _value: undefined as unknown as WorkflowError,
  }),
} as const;

// Helper for generic keys (e.g., for arbitrary data)
export const createRedisKey = <T>(key: string): RedisKey<T> => ({
  __type: 'RedisKey',
  value: key,
  _value: undefined as T,
});

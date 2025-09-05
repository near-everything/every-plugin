/**
 * State transition helpers for common patterns
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

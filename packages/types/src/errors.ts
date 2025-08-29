// Plugin execution errors
export class PluginExecutionError extends Error {
  constructor(message: string, public readonly retryable: boolean = true) {
    super(message);
    this.name = 'PluginExecutionError';
  }
}

export class ConfigurationError extends PluginExecutionError {
  constructor(message: string) {
    super(message, false); // Configuration errors are not retryable
    this.name = 'ConfigurationError';
  }
}

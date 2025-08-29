// TODO: This could be cleaned up, proper error handling
import {
  DbError,
  ValidationError as DbValidationError,
  PluginRunNotFoundError,
  WorkflowNotFoundError,
} from "../db";
import { Data } from "effect";

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly data?: unknown;
  readonly cause?: unknown;
  readonly validationDetails?: string;
}> { }

export class EnvironmentError extends Data.TaggedError("EnvironmentError")<{
  readonly message: string;
  readonly operation: "hydrate-secrets" | "validate-secrets" | "parse-template";
  readonly cause?: unknown;
  readonly context?: Record<string, unknown>;
}> { }

export class PluginError extends Data.TaggedError("PluginError")<{
  readonly message: string;
  readonly pluginId: string;
  readonly operation:
  | "load"
  | "initialize"
  | "execute"
  | "validate"
  | "register"
  | "hydrate-secrets";
  readonly cause?: unknown;
  readonly retryable?: boolean;
  readonly context?: Record<string, unknown>;
}> { }

export class PipelineError extends Data.TaggedError("PipelineError")<{
  readonly message: string;
  readonly pipelineId: string;
  readonly stepId?: string;
  readonly cause: StepError | Error;
  readonly context?: Record<string, unknown>;
}> { }

export type StepError =
  | ValidationError
  | PluginError
  | DbError
  | DbValidationError
  | WorkflowNotFoundError
  | PluginRunNotFoundError;
export type PipelineExecutionError = PipelineError | StepError;

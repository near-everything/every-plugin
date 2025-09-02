import { Data } from "effect";
import type { z } from "zod";

export class PluginRuntimeError extends Data.TaggedError("PluginRuntimeError")<{
  readonly pluginId?: string;
  readonly operation: string;
  readonly cause?: Error;
  readonly retryable: boolean;
}> { }

export class ModuleFederationError extends Data.TaggedError("ModuleFederationError")<{
  readonly pluginId: string;
  readonly remoteUrl: string;
  readonly cause?: Error;
}> { }

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly pluginId: string;
  readonly stage: "config" | "input" | "output";
  readonly zodError: z.ZodError;
}> { }

import { Data } from "effect";
import type { z } from "zod";

export class PluginRuntimeError extends Data.TaggedError("PluginRuntimeError")<{
	readonly pluginId?: string;
	readonly operation: string;
	readonly cause?: Error;
	readonly retryable: boolean;
}> {}

export class ModuleFederationError extends Data.TaggedError(
	"ModuleFederationError",
)<{
	readonly pluginId: string;
	readonly remoteUrl: string;
	readonly cause?: Error;
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
	readonly pluginId: string;
	readonly stage: "config" | "input" | "output" | "state";
	readonly zodError: z.ZodError;
}> {}

export class StreamError extends Data.TaggedError("StreamError")<{
	readonly pluginId: string;
	readonly operation: "callback" | "state-extraction" | "item-extraction" | "stream-termination";
	readonly cause?: Error;
	readonly context?: {
		readonly iteration?: number;
		readonly itemsProcessed?: number;
		readonly procedureName?: string;
	};
}> {}

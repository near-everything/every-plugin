import { Data } from "effect";

// TODO: We still need this?

export class PluginConfigurationError extends Data.TaggedError("PluginConfigurationError")<{
	readonly message: string;
	readonly retryable: boolean;
	readonly cause?: Error;
}> {
	override get name() { return "PluginConfigurationError"; }
}

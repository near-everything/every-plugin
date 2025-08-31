import { Data } from "effect";

export class ValidationError extends Data.TaggedError("ValidationError")<{
	readonly message: string;
	readonly data?: unknown;
	readonly cause?: unknown;
	readonly validationDetails?: string;
}> {}

export class EnvironmentError extends Data.TaggedError("EnvironmentError")<{
	readonly message: string;
	readonly operation: "hydrate-secrets" | "validate-secrets" | "parse-template";
	readonly cause?: unknown;
	readonly context?: Record<string, unknown>;
}> {}

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
}> {}

import { ORPCError } from "@orpc/contract";
import { Data } from "effect";
import type { z } from "zod";

export class PluginRuntimeError extends Data.TaggedError("PluginRuntimeError")<{
	readonly pluginId?: string;
	readonly operation?: string;
	readonly procedureName?: string;
	readonly cause?: Error;
	readonly retryable: boolean;
}> { }

export class ModuleFederationError extends Data.TaggedError(
	"ModuleFederationError",
)<{
	readonly pluginId: string;
	readonly remoteUrl: string;
	readonly cause?: Error;
}> { }

export class ValidationError extends Data.TaggedError("ValidationError")<{
	readonly pluginId: string;
	readonly stage: "config" | "input" | "output" | "state";
	readonly zodError: z.ZodError;
}> { }

// Helper to determine if an oRPC error code is retryable
export const isRetryableORPCCode = (code: string): boolean => {
	switch (code) {
		case 'TOO_MANY_REQUESTS':
		case 'SERVICE_UNAVAILABLE':
		case 'BAD_GATEWAY':
		case 'GATEWAY_TIMEOUT':
		case 'TIMEOUT':
			return true;
		default:
			return false;
	}
};

// Convert ORPC errors from plugin procedures to PluginRuntimeError
export const wrapORPCError = (
	orpcError: ORPCError<string, unknown>,
	pluginId?: string,
	procedureName?: string,
	operation?: string
): PluginRuntimeError => {
	return new PluginRuntimeError({
		pluginId,
		operation,
		procedureName,
		retryable: isRetryableORPCCode(orpcError.code),
		cause: orpcError as Error
	});
};

// Universal error converter for the runtime
export const toPluginRuntimeError = (
	error: unknown,
	pluginId?: string,
	procedureName?: string,
	operation?: string,
	defaultRetryable = false
): PluginRuntimeError => {
	if (error instanceof ORPCError) {
		return wrapORPCError(error, pluginId, procedureName, operation);
	}

	if (error instanceof PluginRuntimeError) {
		return error; // Already converted
	}

	return new PluginRuntimeError({
		pluginId,
		operation,
		procedureName,
		retryable: defaultRetryable,
		cause: error instanceof Error ? error : new Error(String(error))
	});
};

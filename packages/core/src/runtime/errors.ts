import { ORPCError } from "@orpc/contract";
import { Data } from "effect";
import type { z } from "zod";

export class PluginRuntimeError extends Data.TaggedError("PluginRuntimeError")<{
	readonly pluginId?: string;
	readonly operation?: string;
	readonly procedureName?: string;
	readonly cause?: Error;
	readonly retryable: boolean;
}> {
	override get message(): string {
		const parts = ["PluginRuntimeError"];
		if (this.pluginId) parts.push(`[${this.pluginId}]`);
		if (this.operation) parts.push(`${this.operation}`);
		if (this.cause) parts.push(`- ${this.cause.message}`);
		return parts.join(" ");
	}

	override toString(): string {
		return this.message;
	}

	override toJSON(): object {
		return {
			_tag: this._tag,
			...(this.pluginId && { pluginId: this.pluginId }),
			...(this.operation && { operation: this.operation }),
			...(this.procedureName && { procedureName: this.procedureName }),
			...(this.cause && { cause: this.cause.message }),
			retryable: this.retryable,
		};
	}
}

export class ModuleFederationError extends Data.TaggedError(
	"ModuleFederationError",
)<{
	readonly pluginId: string;
	readonly remoteUrl: string;
	readonly cause?: Error;
}> {
	override get message(): string {
		const parts = ["ModuleFederationError", `[${this.pluginId}]`];
		if (this.cause) parts.push(`- ${this.cause.message}`);
		return parts.join(" ");
	}

	override toString(): string {
		return this.message;
	}

	override toJSON(): object {
		return {
			_tag: this._tag,
			pluginId: this.pluginId,
			remoteUrl: this.remoteUrl,
			...(this.cause && { cause: this.cause.message }),
		};
	}
}

export class ValidationError extends Data.TaggedError("ValidationError")<{
	readonly pluginId: string;
	readonly stage: "config" | "input" | "output" | "state";
	readonly zodError: z.ZodError;
}> {
	override get message(): string {
		return `ValidationError [${this.pluginId}] ${this.stage} - ${this.zodError.message}`;
	}

	override toString(): string {
		return this.message;
	}

	override toJSON(): object {
		return {
			_tag: this._tag,
			pluginId: this.pluginId,
			stage: this.stage,
			errors: this.zodError.issues.map((e) => ({
				path: e.path,
				message: e.message,
				code: e.code,
			})),
		};
	}
}

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

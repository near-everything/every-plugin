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

const extractErrorMessage = (error: unknown): string => {
	if (!error) return 'Unknown error';

	if (error instanceof Error) {
		if (error.message) return error.message;
		if ((error as any).cause instanceof Error) {
			return extractErrorMessage((error as any).cause);
		}
	}

	if (error instanceof AggregateError && error.errors?.length) {
		return error.errors.map(e => extractErrorMessage(e)).join('; ');
	}

	if (typeof error === 'object' && 'message' in error) {
		return String((error as any).message);
	}

	return String(error);
};

const formatPluginError = (
	pluginId: string | undefined,
	operation: string | undefined,
	message: string
): void => {
	const lines: string[] = [];

	lines.push(`\n╭─ Plugin Error ${'─'.repeat(40)}`);
	if (pluginId) lines.push(`│  Plugin: ${pluginId}`);
	if (operation) lines.push(`│  During: ${operation}`);
	lines.push(`│`);

	if (message.includes('ECONNREFUSED')) {
		lines.push(`│  ❌ Connection refused`);
		lines.push(`│  `);
		lines.push(`│  A required service is not running.`);
		lines.push(`│  → Run: docker compose up -d`);
	} else if (message.includes('ENOTFOUND')) {
		lines.push(`│  ❌ Host not found`);
		lines.push(`│  `);
		lines.push(`│  Check your connection URL or network settings.`);
	} else if (message.includes('ETIMEDOUT') || message.includes('timeout')) {
		lines.push(`│  ❌ Connection timeout`);
		lines.push(`│  `);
		lines.push(`│  The service took too long to respond.`);
	} else if (message.includes('EACCES') || message.includes('permission')) {
		lines.push(`│  ❌ Permission denied`);
		lines.push(`│  `);
		lines.push(`│  Check credentials or access permissions.`);
	} else if (message.includes('401') || message.includes('unauthorized')) {
		lines.push(`│  ❌ Authentication failed`);
		lines.push(`│  `);
		lines.push(`│  Check your API key or credentials.`);
	} else {
		lines.push(`│  ❌ ${message}`);
	}

	lines.push(`╰${'─'.repeat(50)}\n`);

	console.error(lines.join('\n'));
};

const isRetryableError = (message: string): boolean => {
	const retryablePatterns = ['ETIMEDOUT', 'ECONNRESET', 'timeout', '503', '429'];
	return retryablePatterns.some(p => message.toLowerCase().includes(p.toLowerCase()));
};

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
		return error;
	}

	const message = extractErrorMessage(error);

	formatPluginError(pluginId, operation, message);

	return new PluginRuntimeError({
		pluginId,
		operation,
		procedureName,
		retryable: defaultRetryable || isRetryableError(message),
		cause: error instanceof Error ? error : new Error(message)
	});
};

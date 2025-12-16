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

const formatValidationIssue = (issue: any, index: number, maxDisplay: number): string => {
	if (index >= maxDisplay) return '';
	
	const path = Array.isArray(issue.path) && issue.path.length > 0
		? issue.path.join('.')
		: issue.path || 'root';
	
	const message = issue.message || 'Validation failed';
	
	return `│    ${index + 1}. ${path}: ${message}`;
};

const formatDataPreview = (data: unknown, maxLength = 100): string => {
	if (!data) return 'undefined';
	
	try {
		const str = JSON.stringify(data);
		if (str.length <= maxLength) return str;
		
		if (typeof data === 'object' && data !== null) {
			if (Array.isArray(data)) {
				return `Array(${data.length}) [...]`;
			}
			const keys = Object.keys(data);
			return `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''} }`;
		}
		
		return str.slice(0, maxLength) + '...';
	} catch {
		return String(data).slice(0, maxLength);
	}
};

const formatORPCValidationError = (error: any): string[] | null => {
	const cause = error?.cause || error;
	
	if (!cause?.issues || !Array.isArray(cause.issues) || cause.issues.length === 0) {
		return null;
	}

	const lines: string[] = [];
	const errorType = error?.message || cause?.message || 'Validation failed';
	
	lines.push(`\n╭─ oRPC Validation Error ${'─'.repeat(30)}`);
	lines.push(`│  ${errorType}`);
	lines.push(`│`);
	
	const maxDisplay = 10;
	const totalIssues = cause.issues.length;
	
	lines.push(`│  Issues (${totalIssues}):`);
	
	const displayedIssues = cause.issues.slice(0, maxDisplay);
	displayedIssues.forEach((issue: any, idx: number) => {
		const formatted = formatValidationIssue(issue, idx, maxDisplay);
		if (formatted) lines.push(formatted);
	});
	
	if (totalIssues > maxDisplay) {
		lines.push(`│    ... and ${totalIssues - maxDisplay} more`);
	}
	
	if (cause.data !== undefined) {
		lines.push(`│`);
		lines.push(`│  Data preview: ${formatDataPreview(cause.data, 80)}`);
	}
	
	lines.push(`╰${'─'.repeat(50)}\n`);
	
	return lines;
};

export const formatORPCError = (error: any): void => {
	if (!(error instanceof ORPCError)) {
		return;
	}

	const validationLines = formatORPCValidationError(error);
	if (validationLines) {
		console.error(validationLines.join('\n'));
		return;
	}

	const lines: string[] = [];
	const code = error.code || 'UNKNOWN';
	const status = error.status || 500;
	const message = error.message || 'An error occurred';

	lines.push(`\n╭─ oRPC Error ${'─'.repeat(40)}`);
	lines.push(`│  ${message}`);
	lines.push(`│  Code: ${code} (${status})`);
	lines.push(`│`);

	if (error.data) {
		const dataType = typeof error.data;
		if (dataType === 'object' && error.data !== null) {
			if ('retryAfter' in error.data) {
				lines.push(`│  Retry after: ${error.data.retryAfter} seconds`);
			}
			if ('remainingRequests' in error.data) {
				lines.push(`│  Remaining: ${error.data.remainingRequests} requests`);
			}
			if ('host' in error.data) {
				lines.push(`│  Host: ${error.data.host}`);
			}
			if ('port' in error.data) {
				lines.push(`│  Port: ${error.data.port}`);
			}
			if ('suggestion' in error.data) {
				lines.push(`│  → ${error.data.suggestion}`);
			}
			if ('resource' in error.data) {
				lines.push(`│  Resource: ${error.data.resource}`);
			}
			if ('resourceId' in error.data) {
				lines.push(`│  ID: ${error.data.resourceId}`);
			}
		}
	}

	switch (code) {
		case 'UNAUTHORIZED':
			lines.push(`│  → Check your API key or credentials`);
			break;
		case 'TOO_MANY_REQUESTS':
			lines.push(`│  → Wait before retrying`);
			break;
		case 'SERVICE_UNAVAILABLE':
		case 'BAD_GATEWAY':
		case 'GATEWAY_TIMEOUT':
			lines.push(`│  → The service may be temporarily unavailable`);
			break;
		case 'TIMEOUT':
			lines.push(`│  → The operation took too long`);
			break;
	}

	lines.push(`╰${'─'.repeat(50)}\n`);
	console.error(lines.join('\n'));
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
	const validationLines = formatORPCValidationError(orpcError);
	if (validationLines) {
		console.error(validationLines.join('\n'));
	}
	
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

	const validationLines = formatORPCValidationError(error);
	if (validationLines) {
		console.error(validationLines.join('\n'));
	} else {
		const message = extractErrorMessage(error);
		formatPluginError(pluginId, operation, message);
	}

	return new PluginRuntimeError({
		pluginId,
		operation,
		procedureName,
		retryable: defaultRetryable || isRetryableError(extractErrorMessage(error)),
		cause: error instanceof Error ? error : new Error(extractErrorMessage(error))
	});
};

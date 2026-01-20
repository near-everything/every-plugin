import { z } from "./zod";

/**
 * Error pattern constants for categorizing infrastructure errors
 */
export const ERROR_PATTERNS = {
	CONNECTION_REFUSED: ['ECONNREFUSED'],
	HOST_NOT_FOUND: ['ENOTFOUND', 'EHOSTUNREACH'],
	TIMEOUT: ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'timeout'],
	CONNECTION_RESET: ['ECONNRESET', 'EPIPE'],
	PERMISSION: ['EACCES', 'EPERM', 'permission denied'],
	AUTH: ['401', 'unauthorized', 'authentication failed'],
	RATE_LIMITED: ['429', 'too many requests', 'rate limit'],
	SERVICE_UNAVAILABLE: ['503', 'service unavailable'],
} as const;

/**
 * Common error schemas for plugin contracts.
 * Import individually or use the grouped PluginErrors export.
 *
 * @example
 * ```typescript
 * import { NOT_FOUND, FORBIDDEN, UNAUTHORIZED } from "every-plugin/errors";
 *
 * export const contract = oc.router({
 *   getData: oc.route(...)
 *     .errors({ NOT_FOUND, FORBIDDEN, UNAUTHORIZED })
 * });
 * ```
 */

export const UNAUTHORIZED = {
	status: 401,
	data: z.object({
		apiKeyProvided: z.boolean(),
		provider: z.string().optional(),
		authType: z.enum(['apiKey', 'oauth', 'token']).optional(),
	})
} as const;

export const RATE_LIMITED = {
	status: 429,
	data: z.object({
		retryAfter: z.number().int().min(1),
		remainingRequests: z.number().int().min(0).optional(),
		resetTime: z.string().datetime().optional(),
		limitType: z.enum(['requests', 'tokens', 'bandwidth']).optional(),
	})
} as const;

export const SERVICE_UNAVAILABLE = {
	status: 503,
	data: z.object({
		retryAfter: z.number().int().optional(),
		maintenanceWindow: z.boolean().default(false),
		estimatedUptime: z.string().datetime().optional(),
	})
} as const;

export const BAD_REQUEST = {
	status: 400,
	data: z.object({
		invalidFields: z.array(z.string()).optional(),
		validationErrors: z.array(z.object({
			field: z.string(),
			message: z.string(),
			code: z.string().optional(),
		})).optional(),
	})
} as const;

export const NOT_FOUND = {
	status: 404,
	data: z.object({
		resource: z.string().optional(),
		resourceId: z.string().optional(),
	})
} as const;

export const FORBIDDEN = {
	status: 403,
	data: z.object({
		requiredPermissions: z.array(z.string()).optional(),
		action: z.string().optional(),
	})
} as const;

export const TIMEOUT = {
	status: 504,
	data: z.object({
		timeoutMs: z.number().int().min(0).optional(),
		operation: z.string().optional(),
		retryable: z.boolean().default(true),
	})
} as const;

export const CONNECTION_ERROR = {
	status: 502,
	data: z.object({
		errorCode: z.string().optional(),
		host: z.string().optional(),
		port: z.number().int().optional(),
		suggestion: z.string().optional(),
	})
} as const;

/**
 * Grouped export for all plugin errors.
 * Use individual imports for cleaner code.
 */
export const PluginErrors = {
	UNAUTHORIZED,
	RATE_LIMITED,
	SERVICE_UNAVAILABLE,
	BAD_REQUEST,
	NOT_FOUND,
	FORBIDDEN,
	TIMEOUT,
	CONNECTION_ERROR,
} as const;

/**
 * @deprecated Use individual imports or PluginErrors instead
 */
export const CommonPluginErrors = PluginErrors;

export {
	formatORPCError,
	isRetryableORPCCode,
	wrapORPCError,
	toPluginRuntimeError,
	extractFromFiberFailure,
	PluginRuntimeError,
	ModuleFederationError,
	ValidationError,
} from "./runtime/errors";

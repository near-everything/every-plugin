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
 * Import these to ensure consistent error handling across plugins.
 *
 * @example
 * ```typescript
 * import { CommonPluginErrors } from "every-plugin/errors";
 *
 * export const contract = oc.router({
 *   getData: oc.route(...)
 *     .errors(CommonPluginErrors)
 * });
 * ```
 */
export const CommonPluginErrors = {
	UNAUTHORIZED: {
		status: 401,
		data: z.object({
			apiKeyProvided: z.boolean(),
			provider: z.string().optional(),
			authType: z.enum(['apiKey', 'oauth', 'token']).optional(),
		})
	},
	RATE_LIMITED: {
		status: 429,
		data: z.object({
			retryAfter: z.number().int().min(1),
			remainingRequests: z.number().int().min(0).optional(),
			resetTime: z.string().datetime().optional(),
			limitType: z.enum(['requests', 'tokens', 'bandwidth']).optional(),
		})
	},
	SERVICE_UNAVAILABLE: {
		status: 503,
		data: z.object({
			retryAfter: z.number().int().optional(),
			maintenanceWindow: z.boolean().default(false),
			estimatedUptime: z.string().datetime().optional(),
		})
	},
	BAD_REQUEST: {
		status: 400,
		data: z.object({
			invalidFields: z.array(z.string()).optional(),
			validationErrors: z.array(z.object({
				field: z.string(),
				message: z.string(),
				code: z.string().optional(),
			})).optional(),
		})
	},
	NOT_FOUND: {
		status: 404,
		data: z.object({
			resource: z.string().optional(),
			resourceId: z.string().optional(),
		})
	},
	FORBIDDEN: {
		status: 403,
		data: z.object({
			requiredPermissions: z.array(z.string()).optional(),
			action: z.string().optional(),
		})
	},
	TIMEOUT: {
		status: 504,
		data: z.object({
			timeoutMs: z.number().int().min(0).optional(),
			operation: z.string().optional(),
			retryable: z.boolean().default(true),
		})
	},
	CONNECTION_ERROR: {
		status: 502,
		data: z.object({
			errorCode: z.string().optional(),
			host: z.string().optional(),
			port: z.number().int().optional(),
			suggestion: z.string().optional(),
		})
	}
} as const;

export {
	formatORPCError,
	isRetryableORPCCode,
	wrapORPCError,
	toPluginRuntimeError,
	PluginRuntimeError,
	ModuleFederationError,
	ValidationError,
} from "./runtime/errors";

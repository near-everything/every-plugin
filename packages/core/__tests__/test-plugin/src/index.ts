import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { z } from "zod";
import {
	CommonPluginErrors,
	createConfigSchema,
	createPlugin,
	PluginConfigurationError,
} from "../../../src/index";
import { SourceTemplateClient } from "./client";

// Configuration schemas
const VariablesSchema = z.object({
	baseUrl: z.string(),
	timeout: z.number().optional(),
});

const SecretsSchema = z.object({
	apiKey: z.string(),
});

const SourceTemplateConfigSchema = createConfigSchema(VariablesSchema, SecretsSchema);
type SourceTemplateConfig = z.infer<typeof SourceTemplateConfigSchema>;

// Export for use in tests
export { SourceTemplateConfigSchema };

// Source item schema that plugins return
const sourceItemSchema = z.object({
	externalId: z.string(),
	content: z.string(),
	contentType: z.string().optional(),
	createdAt: z.string().optional(),
	url: z.string().optional(),
	authors: z.array(z.object({
		id: z.string().optional(),
		username: z.string().optional(),
		displayName: z.string().optional(),
		url: z.string().optional(),
	})).optional(),
	raw: z.unknown(), // Original API response
});

// Contract definition for the test plugin
export const sourceContract = oc.router({
	// Basic single item fetch
	getById: oc
		.input(z.object({
			id: z.string()
		}))
		.output(z.object({
			item: sourceItemSchema
		}))
		.errors(CommonPluginErrors),

	// Basic bulk fetch
	getBulk: oc
		.input(z.object({
			ids: z.array(z.string()),
		}))
		.output(z.object({
			items: z.array(sourceItemSchema),
		}))
		.errors(CommonPluginErrors),

	// Simple streaming - returns fixed number of items
	simpleStream: oc
		.input(z.object({
			count: z.number().min(1).max(10).default(3),
			prefix: z.string().default("item"),
		}))
		.errors(CommonPluginErrors),

	// Empty stream - returns no items
	emptyStream: oc
		.input(z.object({
			reason: z.string().optional(),
		}))
		.errors(CommonPluginErrors),

	// Error testing procedures
	throwUnauthorized: oc
		.input(z.object({}))
		.output(z.object({ message: z.string() }))
		.errors(CommonPluginErrors),

	throwForbidden: oc
		.input(z.object({}))
		.output(z.object({ message: z.string() }))
		.errors(CommonPluginErrors),

	throwRateLimit: oc
		.input(z.object({}))
		.output(z.object({ message: z.string() }))
		.errors(CommonPluginErrors),

	throwServiceUnavailable: oc
		.input(z.object({}))
		.output(z.object({ message: z.string() }))
		.errors(CommonPluginErrors),

	// Config validation testing
	requiresSpecialConfig: oc
		.input(z.object({
			checkValue: z.string(),
		}))
		.output(z.object({
			configValue: z.string(),
			inputValue: z.string(),
		}))
		.errors(CommonPluginErrors),
});

// Export types for use in implementation
export type SourceContract = typeof sourceContract;
export type SourceItem = z.infer<typeof sourceItemSchema>;

// Helper to create consistent test items
function createTestItem(id: string, prefix: string = "item"): SourceItem {
	return {
		externalId: id,
		content: `${prefix} content for ${id}`,
		contentType: "post",
		createdAt: new Date().toISOString(),
		url: `https://example.com/posts/${id}`,
		authors: [{
			username: "test_user",
			displayName: "Test User",
		}],
		raw: { id, prefix, type: "test" },
	};
}

// Create the test plugin
const TestPlugin = createPlugin<
	typeof sourceContract,
	typeof SourceTemplateConfigSchema,
	{ client: SourceTemplateClient; baseUrl: string }
>({
	id: "test-plugin",
	type: "source",
	contract: sourceContract,
	configSchema: SourceTemplateConfigSchema,
	initialize: async (config: SourceTemplateConfig) => {
		// Business logic validation - config structure is guaranteed by schema
		if (config.secrets.apiKey === "invalid-key") {
			throw new PluginConfigurationError({
				message: "Invalid API key format",
				retryable: false
			});
		}

		// Initialize client
		const client = new SourceTemplateClient(
			config.variables.baseUrl,
			config.secrets.apiKey,
		);

		// Test connection (can throw for testing)
		if (config.secrets.apiKey === "connection-fail") {
			throw new Error("Failed to connect to service");
		}

		await client.healthCheck();

		// Return context object - this gets passed to createRouter
		return {
			client,
			baseUrl: config.variables.baseUrl
		};
	},
	createRouter: (context: { client: SourceTemplateClient; baseUrl: string }) => {
		const os = implement(sourceContract).$context<{ client: SourceTemplateClient; baseUrl: string }>();

		// Basic single item fetch
		const getById = os.getById.handler(async ({ input }) => {
			if (!context.client) {
				throw new Error("Plugin not initialized");
			}

			return {
				item: createTestItem(input.id, "single"),
			};
		});

		// Basic bulk fetch
		const getBulk = os.getBulk.handler(async ({ input }) => {
			if (!context.client) {
				throw new Error("Plugin not initialized");
			}

			return {
				items: input.ids.map(id => createTestItem(id, "bulk")),
			};
		});

		// Simple predictable streaming
		const simpleStream = os.simpleStream.handler(async function* ({ input }) {
			for (let i = 0; i < input.count; i++) {
				const item = createTestItem(`${input.prefix}_${i}`, input.prefix);

				yield {
					item,
					state: {
						nextPollMs: null, // Terminate after this batch
						phase: "simple",
						jobId: `simple_${Date.now()}`,
						lastId: item.externalId,
					},
					metadata: {
						itemIndex: i,
						timestamp: Date.now(),
					}
				};

				// Small delay for testing
				await new Promise(resolve => setTimeout(resolve, 5));
			}
		});

		// Empty stream for testing
		const emptyStream = os.emptyStream.handler(async function* ({ input }) {
			// Log the reason but don't yield anything
			console.log(`[TEST-PLUGIN] Empty stream requested: ${input.reason || 'no reason'}`);
			// Generator ends immediately - no yields
			// biome-ignore lint/correctness/noConstantCondition: test case
			if (false) yield;
		});

		// Error testing procedures
		const throwUnauthorized = os.throwUnauthorized.handler(async ({ errors }) => {
			throw errors.UNAUTHORIZED({
				message: "Test unauthorized error",
				data: { apiKeyProvided: true, authType: 'apiKey' as const }
			});
		});

		const throwForbidden = os.throwForbidden.handler(async ({ errors }) => {
			throw errors.FORBIDDEN({
				message: "Test forbidden error",
				data: { requiredPermissions: ['read:data'], action: 'test' }
			});
		});

		const throwRateLimit = os.throwRateLimit.handler(async ({ errors }) => {
			throw errors.RATE_LIMITED({
				message: "Test rate limit error",
				data: {
					retryAfter: 60,
					remainingRequests: 0,
					limitType: 'requests' as const
				}
			});
		});

		const throwServiceUnavailable = os.throwServiceUnavailable.handler(async ({ errors }) => {
			throw errors.SERVICE_UNAVAILABLE({
				message: "Test service unavailable error",
				data: {
					retryAfter: 30,
					maintenanceWindow: false
				}
			});
		});

		// Config validation testing
		const requiresSpecialConfig = os.requiresSpecialConfig.handler(async ({ input }) => {
			return {
				configValue: context.baseUrl,
				inputValue: input.checkValue,
			};
		});

		// Return the oRPC router
		return os.router({
			getById,
			getBulk,
			simpleStream,
			emptyStream,
			throwUnauthorized,
			throwForbidden,
			throwRateLimit,
			throwServiceUnavailable,
			requiresSpecialConfig,
		});
	}
});

export default TestPlugin;

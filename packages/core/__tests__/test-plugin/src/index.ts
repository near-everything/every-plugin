import { type ContractRouterClient, oc } from "@orpc/contract";
import { eventIterator, implement } from "@orpc/server";
import { z } from "zod";
import {
	CommonPluginErrors,
	createPlugin,
	PluginConfigurationError,
} from "../../../src/index";
import { TestClient, testItemSchema } from "./client";

// Schema for streaming events
const streamEventSchema = z.object({
	item: testItemSchema,
	state: z.object({
		nextPollMs: z.number().nullable(),
		lastId: z.string(),
	}),
	metadata: z.object({
		itemIndex: z.number(),
	})
});

// Contract definition for the test plugin
export const testContract = oc.router({
	// Basic single item fetch
	getById: oc
		.route({ method: 'POST', path: '/getById' })
		.input(z.object({
			id: z.string()
		}))
		.output(z.object({
			item: testItemSchema
		}))
		.errors(CommonPluginErrors),

	// Basic bulk fetch
	getBulk: oc
		.route({ method: 'POST', path: '/getBulk' })
		.input(z.object({
			ids: z.array(z.string()),
		}))
		.output(z.object({
			items: z.array(testItemSchema),
		}))
		.errors(CommonPluginErrors),

	// Simple streaming - returns fixed number of items
	simpleStream: oc
		.route({ method: 'POST', path: '/simpleStream' })
		.input(z.object({
			count: z.number().min(1).max(10).default(3),
			prefix: z.string().default("item"),
		}))
		.output(eventIterator(streamEventSchema))
		.errors(CommonPluginErrors),

	// Empty stream - returns no items
	emptyStream: oc
		.route({ method: 'POST', path: '/emptyStream' })
		.input(z.object({
			reason: z.string().optional(),
		}))
		.output(eventIterator(streamEventSchema))
		.errors(CommonPluginErrors),

	// Consolidated error testing procedure
	throwError: oc
		.route({ method: 'POST', path: '/throwError' })
		.input(z.object({
			errorType: z.enum(['UNAUTHORIZED', 'FORBIDDEN', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE']),
			customMessage: z.string().optional()
		}))
		.output(z.object({ message: z.string() }))
		.errors(CommonPluginErrors),

	// Config validation testing
	requiresSpecialConfig: oc
		.route({ method: 'POST', path: '/requiresSpecialConfig' })
		.input(z.object({
			checkValue: z.string(),
		}))
		.output(z.object({
			configValue: z.string(),
			inputValue: z.string(),
		}))
		.errors(CommonPluginErrors),
});

// Export the client type for typed oRPC clients
export type TestPluginClient = ContractRouterClient<typeof testContract>;

// Create the test plugin
export default createPlugin({
	id: "test-plugin",
	type: "source",
	variables: z.object({
		baseUrl: z.string(),
		timeout: z.number().optional(),
	}),
	secrets: z.object({
		apiKey: z.string(),
	}),
	contract: testContract,
	initialize: async (config) => {
		// Business logic validation - config structure is guaranteed by schema
		if (config.secrets.apiKey === "invalid-key") {
			throw new PluginConfigurationError({
				message: "Invalid API key format",
				retryable: false
			});
		}

		// Initialize client
		const client = new TestClient(
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
			client
		};
	},
	createRouter: (context: { client: TestClient }) => {
		const os = implement(testContract).$context<{ client: TestClient }>();

		// Basic single item fetch
		const getById = os.getById.handler(async ({ input }) => {
			const item = await context.client.fetchById(input.id);
			return { item };
		});

		// Basic bulk fetch
		const getBulk = os.getBulk.handler(async ({ input }) => {
			const items = await context.client.fetchBulk(input.ids);
			return { items };
		});

		// Simple predictable streaming
		const simpleStream = os.simpleStream.handler(async function* ({ input }) {
			yield* context.client.streamItems(input.count, input.prefix);
		});

		// Empty stream for testing
		// biome-ignore lint/correctness/useYield: specific test case
		const emptyStream = os.emptyStream.handler(async function* ({ input }) {
			// Log why it's empty, do any setup/cleanup, but don't yield
			console.log(`Empty stream: ${input.reason}`);
			// Generator ends without yielding - creates empty AsyncIterable
			return;
		});

		// Error testing procedure
		const throwError = os.throwError.handler(async ({ input, errors }) => {
			const message = input.customMessage || `Test ${input.errorType.toLowerCase()} error`;

			switch (input.errorType) {
				case 'UNAUTHORIZED':
					throw errors.UNAUTHORIZED({
						message,
						data: { apiKeyProvided: true, authType: 'apiKey' as const }
					});
				case 'FORBIDDEN':
					throw errors.FORBIDDEN({
						message,
						data: { requiredPermissions: ['read:data'], action: 'test' }
					});
				case 'RATE_LIMITED':
					throw errors.RATE_LIMITED({
						message,
						data: {
							retryAfter: 60,
							remainingRequests: 0,
							limitType: 'requests' as const
						}
					});
				case 'SERVICE_UNAVAILABLE':
					throw errors.SERVICE_UNAVAILABLE({
						message,
						data: {
							retryAfter: 30,
							maintenanceWindow: false
						}
					});
			}
		});

		// Config validation testing
		const requiresSpecialConfig = os.requiresSpecialConfig.handler(async ({ input }) => {
			return {
				configValue: context.client.getConfigValue(),
				inputValue: input.checkValue,
			};
		});

		// Return the oRPC router
		return os.router({
			getById,
			getBulk,
			simpleStream,
			emptyStream,
			throwError,
			requiresSpecialConfig,
		});
	}
});

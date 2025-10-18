import {
	CommonPluginErrors,
	createPlugin,
	PluginConfigurationError,
} from "every-plugin";
import { Effect, Queue } from "every-plugin/effect";
import { type ContractRouterClient, eventIterator, getEventMeta, oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import { MemoryPublisher } from '@orpc/experimental-publisher/memory';
import { TestClient, testItemSchema } from "./client";

// Define publisher event types
type BackgroundEvents = {
	'background-updates': {
		id: string;
		index: number;
		timestamp: number;
	};
};

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

// Schema for background producer events
const backgroundEventSchema = z.object({
	id: z.string(),
	index: z.number(),
	timestamp: z.number(),
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

	// Background producer streaming - simulates long-lived process
	listenBackground: oc
		.route({ method: 'POST', path: '/listenBackground' })
		.input(z.object({
			maxResults: z.number().min(1).max(100).optional(),
			lastEventId: z.string().optional(),
		}))
		.output(eventIterator(backgroundEventSchema))
		.errors(CommonPluginErrors),

	// Utility to manually enqueue background events
	enqueueBackground: oc
		.route({ method: 'POST', path: '/enqueueBackground' })
		.input(z.object({
			id: z.string().optional(),
		}))
		.output(z.object({
			ok: z.boolean(),
		}))
		.errors(CommonPluginErrors),



	// Simple ping for testing client dispatch
	ping: oc
		.route({ method: 'POST', path: '/ping' })
		.output(z.object({
			ok: z.boolean(),
			timestamp: z.number(),
		}))
		.errors(CommonPluginErrors),
});

// Export the client type for typed oRPC clients
export type TestPluginClient = ContractRouterClient<typeof testContract>;

// Create the test plugin
export const TestPlugin = createPlugin({
	id: "test-plugin",
	variables: z.object({
		baseUrl: z.string(),
		timeout: z.number().optional(),
		backgroundEnabled: z.boolean().default(false).optional(),
		backgroundIntervalMs: z.number().min(50).max(5000).default(500).optional(),
		backgroundMaxItems: z.number().min(1).max(1000).optional(),
	}),
	secrets: z.object({
		apiKey: z.string(),
	}),
	contract: testContract,
	initialize: (config) =>
		Effect.gen(function* () {
			// Business logic validation - config structure is guaranteed by schema
			if (config.secrets.apiKey === "invalid-key") {
				yield* Effect.fail(new PluginConfigurationError({
					message: "Invalid API key format",
					retryable: false
				}));
			}

			// Initialize client
			const client = new TestClient(
				config.variables.baseUrl,
				config.secrets.apiKey,
			);

			// Test connection (can throw for testing)
			if (config.secrets.apiKey === "connection-fail") {
				yield* Effect.fail(new Error("Failed to connect to service"));
			}

			yield* Effect.tryPromise({
				try: () => client.healthCheck(),
				catch: (error) => new Error(`Health check failed: ${error instanceof Error ? error.message : String(error)}`)
			});

			// Create publisher for background events with resume support for serverless
			const publisher = new MemoryPublisher<BackgroundEvents>({
				resumeRetentionSeconds: 60 * 2, // Retain events for 2 minutes to support resume
			});

			// Start background producer if enabled
			if (config.variables.backgroundEnabled) {
				const maxItems = config.variables.backgroundMaxItems;

				yield* Effect.forkScoped(
					Effect.gen(function* () {
						let i = 0;
						while (!maxItems || i < maxItems) {
							i++;

							const event = {
								id: `bg-${i}`,
								index: i,
								timestamp: Date.now(),
							};

							yield* Effect.tryPromise(() =>
								publisher.publish('background-updates', event)
							).pipe(
								Effect.catchAll((error) => {
									console.log(`[TestPlugin] Publish failed for event ${i}:`, error);
									return Effect.void;
								})
							);

							yield* Effect.tryPromise(() =>
								new Promise(resolve => setTimeout(resolve, config.variables.backgroundIntervalMs))
							);
						}
						console.log(`[TestPlugin] Background producer completed after ${i} events`);
					})
				);
			}

			// Return context object - this gets passed to createRouter
			return {
				client,
				publisher
			};
		}),
	createRouter: (context, builder) => {
		const { client, publisher } = context;


		return {
			getById: builder.getById.handler(async ({ input }) => {
				const item = await client.fetchById(input.id);
				return { item };
			}),

			getBulk: builder.getBulk.handler(async ({ input }) => {
				const items = await client.fetchBulk(input.ids);
				return { items };
			}),

			simpleStream: builder.simpleStream.handler(async function* ({ input }) {
				yield* client.streamItems(input.count, input.prefix);
			}),

			// biome-ignore lint/correctness/useYield: specific test case
			emptyStream: builder.emptyStream.handler(async function* ({ input }) {
				// Log why it's empty, do any setup/cleanup, but don't yield
				console.log(`Empty stream: ${input.reason}`);
				// Generator ends without yielding - creates empty AsyncIterable
				return;
			}),

			throwError: builder.throwError.handler(async ({ input, errors }) => {
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
			}),

			requiresSpecialConfig: builder.requiresSpecialConfig.handler(async ({ input }) => {
				return {
					configValue: client.getConfigValue(),
					inputValue: input.checkValue,
				};
			}),

			listenBackground: builder.listenBackground.handler(async function* ({ input, signal, lastEventId }) {
				let count = 0;
				const maxResults = input.maxResults;
				const iterator = publisher.subscribe('background-updates', { signal, lastEventId });

				for await (const event of iterator) {
					if (maxResults && count >= maxResults) break;

					// Yield the payload directly (oRPC Publisher manages event metadata)
					yield event;
					count++;
				}
			}),

			enqueueBackground: builder.enqueueBackground.handler(async ({ input }) => {
				const event = {
					id: input.id || `manual-${Date.now()}`,
					index: -1, // Manual events use -1 to distinguish from auto-generated
					timestamp: Date.now(),
				};

				await publisher.publish('background-updates', event);
				return { ok: true };
			}),



			ping: builder.ping.handler(async () => {
				return { ok: true, timestamp: Date.now() };
			}),
		};
	}
});

export default TestPlugin;

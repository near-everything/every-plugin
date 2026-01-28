import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { MemoryPublisher, ORPCError } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import { TestClient } from "./client";
import { testContract } from "./contract";

export { testContract };

// Define publisher event types
type BackgroundEvents = {
	'background-updates': {
		id: string;
		index: number;
		timestamp: number;
	};
};

// Create the test plugin
export const TestPlugin = createPlugin({
	variables: z.object({
		baseUrl: z.string(),
		timeout: z.number().optional(),
		backgroundEnabled: z.boolean().default(false).optional(),
		backgroundIntervalMs: z.number().min(50).max(5000).default(500).optional(),
		backgroundMaxItems: z.number().min(1).max(1000).optional(),
		client: z.custom<any>((val) => val && typeof val === 'object', {
			message: "Must be an object"
		}).optional(),
	}),
	secrets: z.object({
		apiKey: z.string(),
	}),
	context: z.object({
		userId: z.string().optional(),
		sessionId: z.string().optional(),
	}),
	contract: testContract,
	initialize: (config) =>
		Effect.gen(function* () {
			// Business logic validation - config structure is guaranteed by schema
			if (config.secrets.apiKey === "invalid-key") {
				yield* Effect.fail(new Error("Invalid API key format"));
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
				publisher,
				customClient: config.variables.client,
			};
		}),
	createRouter: (deps, builder) => {
		const { client, publisher, customClient } = deps;

		// Middleware for authentication
		const requireAuth = builder.middleware(async ({ context, next }) => {
			if (!context.userId) {
				throw new ORPCError('UNAUTHORIZED', { message: 'User ID required' });
			}
			return next({ context: { ...context, userId: context.userId } });
		});

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

			requiresSpecialConfig: builder.requiresSpecialConfig
				.use(requireAuth)
				.handler(async ({ input, context }) => {
					// context.userId is now guaranteed to be non-null due to middleware
					return {
						configValue: client.getConfigValue(),
						inputValue: input.checkValue,
						userId: context.userId,
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

			useClient: builder.useClient.handler(async ({ input }) => {
				if (!customClient) {
					return {
						result: 'No client provided',
						clientType: 'undefined',
						hasGetDataMethod: false,
						hasGetBaseUrlMethod: false,
					};
				}

				const hasGetData = typeof customClient.getData === 'function';
				const hasGetBaseUrl = typeof customClient.getBaseUrl === 'function';

				let result: string;
				try {
					if (hasGetData) {
						const data = await customClient.getData(input.id);
						result = `data: ${JSON.stringify(data)}`;
					} else {
						result = 'Client missing getData method';
					}
				} catch (error) {
					result = `Error calling client.getData: ${error instanceof Error ? error.message : String(error)}`;
				}

				return {
					result,
					clientType: customClient.constructor?.name || 'Unknown',
					hasGetDataMethod: hasGetData,
					hasGetBaseUrlMethod: hasGetBaseUrl,
				};
			}),
		};
	}
});

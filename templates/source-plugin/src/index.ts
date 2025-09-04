import type { InferContractRouterInputs, InferContractRouterOutputs } from "@orpc/contract";
import { call, implement } from "@orpc/server";
import {
	ConfigurationError,
	Effect,
	PluginExecutionError,
	PluginLoggerTag,
	type SourcePlugin,
	type z
} from "every-plugin";
import { SourceTemplateClient } from "./client";
import {
	type SourceTemplateConfig,
	SourceTemplateConfigSchema,
	type SourceTemplateInput,
	SourceTemplateInputSchema,
	SourceTemplateOutputSchema,
	StateSchema,
	sourceContract
} from "./schemas";

type ContractInputs = InferContractRouterInputs<typeof sourceContract>;
type ContractOutputs = InferContractRouterOutputs<typeof sourceContract>;

// Add missing helper functions
function generateHistoricalItems(query: string) {
	return Array.from({ length: 3 }, (_, i) => ({
		externalId: `hist_${query}_${i}`,
		content: `Historical ${query} item ${i}`,
		contentType: "post",
		createdAt: new Date().toISOString(),
		url: `https://example.com/hist/${i}`,
		authors: [{ username: "hist_user", displayName: "Historical User" }],
		raw: { type: "historical", index: i, query }
	}));
}

function generateRealtimeItems(query: string, lastId: string) {
	// Return 0-2 random items to simulate real-time activity
	const count = Math.floor(Math.random() * 3);
	return Array.from({ length: count }, (_, i) => ({
		externalId: `rt_${query}_${Date.now()}_${i}`,
		content: `Real-time ${query} item ${i}`,
		contentType: "post",
		createdAt: new Date().toISOString(),
		url: `https://example.com/realtime/${i}`,
		authors: [{ username: "rt_user", displayName: "Real-time User" }],
		raw: { type: "realtime", index: i, query, lastId }
	}));
}

export class SourceTemplatePlugin implements SourcePlugin<
	typeof sourceContract,
	typeof SourceTemplateConfigSchema,
	typeof StateSchema
> {
	readonly id = "test-source-plugin" as const;
	readonly type = "source" as const;
	readonly contract = sourceContract;
	readonly configSchema = SourceTemplateConfigSchema;
	readonly stateSchema = StateSchema;
	readonly inputSchema = SourceTemplateInputSchema;
	readonly outputSchema = SourceTemplateOutputSchema;

	// Export contract for client consumption
	static readonly contract = sourceContract;

	private config: SourceTemplateConfig | null = null;
	private client: SourceTemplateClient | null = null;

	// State injection middleware for streaming procedures
	private stateMiddleware = implement(sourceContract).$context<{ state?: z.infer<typeof StateSchema> }>().middleware(async ({ context, next }) => {
		return next({
			context: {

				state: context.state
			}
		});
	});

	private os = implement(sourceContract);

	initialize(
		config?: SourceTemplateConfig,
	): Effect.Effect<void, ConfigurationError, PluginLoggerTag> {
		const self = this;
		return Effect.gen(function* () {
			const logger = yield* PluginLoggerTag;

			if (!config?.secrets?.apiKey) {
				const error = new ConfigurationError("API key is required.");
				yield* logger.logError(
					"Configuration error: API key is missing.",
					error,
				);
				yield* Effect.fail(error);
				return;
			}

			self.config = config;

			// Initialize SourceTemplate client
			try {
				self.client = new SourceTemplateClient(
					config.variables?.baseUrl || "http://localhost:1337",
					config.secrets.apiKey,
				);
			} catch (clientError) {
				const error = new ConfigurationError(
					`Failed to initialize SourceTemplate client: ${clientError instanceof Error ? clientError.message : "Unknown error"}`,
				);
				yield* logger.logError("Client initialization failed", error);
				yield* Effect.fail(error);
				return;
			}

			// Test connection
			yield* Effect.tryPromise({
				try: () => {
					if (!self.client) {
						throw new Error("Client not initialized");
					}
					return self.client.healthCheck();
				},
				catch: (healthCheckError: unknown) => {
					const error = new ConfigurationError(
						`Health check failed: ${healthCheckError instanceof Error ? healthCheckError.message : "Unknown error"}`,
					);
					return error;
				},
			});

			yield* logger.logDebug("SourceTemplate plugin initialized successfully", {
				pluginId: self.id,
				baseUrl: config.variables?.baseUrl,
			});
		});
	}

	// oRPC procedure implementations
	private getById = this.os.getById.handler(async ({ input }) => {
		if (!this.client) {
			throw new Error("Plugin not initialized");
		}

		// Mock single item fetch
		const mockItem = {
			apiId: input.id,
			title: `Item ${input.id}`,
			content: `Content for item ${input.id}`,
			timestamp: new Date().toISOString(),
		};

		return {
			item: {
				externalId: mockItem.apiId,
				content: mockItem.content,
				contentType: "post",
				createdAt: mockItem.timestamp,
				url: `https://example.com/posts/${mockItem.apiId}`,
				authors: [{
					username: "mock_user",
					displayName: "Mock User",
				}],
				raw: mockItem,
			},
		};
	});

	private search = this.os.use(this.stateMiddleware).search.handler(async ({ input, context }) => {
		const state = context.state;

		// Phase 1: Initialize historical job
		if (!state) {
			return {
				items: [],
				nextState: {
					phase: "historical",
					jobId: `hist_${Date.now()}`,
					nextPollMs: 10
				}
			};
		}

		// Phase 2-5: Handle state transitions
		switch (`${state.phase}-${state.status || 'none'}`) {
			case "historical-none":
				return {
					items: [],
					nextState: { ...state, status: "processing", nextPollMs: 10 }
				};

			case "historical-processing":
				return {
					items: generateHistoricalItems(input.query),
					nextState: {
						phase: "realtime",
						lastId: `hist_end_${Date.now()}`,
						nextPollMs: 10
					}
				};

			case "empty-none":
				// Deterministic empty phase - always returns 0 items
				return {
					items: [],
					nextState: {
						phase: "empty",
						status: "complete",
						nextPollMs: 10
					}
				};

			case "empty-complete":
				// Stay in empty phase, always return 0 items
				return {
					items: [],
					nextState: {
						phase: "empty",
						status: "complete",
						nextPollMs: 10
					}
				};

			default: {// realtime phase
				const newItems = generateRealtimeItems(input.query, state.lastId || "");
				return {
					items: newItems,
					nextState: {
						phase: "realtime",
						lastId: newItems.length > 0 ? `new_${Date.now()}` : (state.lastId || ""),
						nextPollMs: newItems.length > 0 ? 10 : 10
					}
				};
			}
		}
	});

	private getBulk = this.os.getBulk.handler(async ({ input }) => {
		if (!this.client) {
			throw new Error("Plugin not initialized");
		}

		// Mock bulk fetch
		const mockItems = input.ids.map(id => ({
			apiId: id,
			title: `Bulk item ${id}`,
			content: `Bulk content for item ${id}`,
			timestamp: new Date().toISOString(),
		}));

		return {
			items: mockItems.map(item => ({
				externalId: item.apiId,
				content: item.content,
				contentType: "post",
				createdAt: item.timestamp,
				url: `https://example.com/posts/${item.apiId}`,
				authors: [{
					username: "mock_user",
					displayName: "Mock User",
				}],
				raw: item,
			})),
		};
	});

	// Main execute method that routes procedures based on discriminated union input
	execute(input: SourceTemplateInput): Effect.Effect<z.infer<this['outputSchema']>, PluginExecutionError, PluginLoggerTag> {
		const self = this;
		return Effect.gen(function* () {
			if (!self.config) {
				return yield* Effect.fail(
					new PluginExecutionError("Plugin not initialized", false),
				);
			}

			// Route based on procedure field
			switch (input.procedure) {
				case "getById": {
					const result = yield* Effect.tryPromise({
						try: () => call(self.getById, input.input as ContractInputs["getById"], { context: {} }),
						catch: (error) => new PluginExecutionError(`getById failed: ${error}`, true)
					});
					return result as z.infer<typeof self['outputSchema']>;
				}
				case "search": {
					// For search, pass state through context
					const result = yield* Effect.tryPromise({
						try: () => call(self.search, input.input as ContractInputs["search"], {
							context: { state: ('state' in input ? input.state : null) as z.infer<typeof StateSchema> }
						}),
						catch: (error) => new PluginExecutionError(`search failed: ${error}`, true)
					});
					return result as z.infer<typeof self['outputSchema']>;
				}
				case "getBulk": {
					const result = yield* Effect.tryPromise({
						try: () => call(self.getBulk, input.input as ContractInputs["getBulk"], { context: {} }),
						catch: (error) => new PluginExecutionError(`getBulk failed: ${error}`, true)
					});
					return result as z.infer<typeof self['outputSchema']>;
				}
				default:
					return yield* Effect.fail(
						new PluginExecutionError(
							`Unknown procedure: ${input.procedure}`,
							false,
						),
					);
			}
		});
	}

	// Create oRPC router
	createRouter() {
		return this.os.router({
			getById: this.getById,
			search: this.search,
			getBulk: this.getBulk,
		});
	}

	private static streamableProcedures = new Set(['search']);

	isStreamable(procedureName: string): boolean {
		return SourceTemplatePlugin.streamableProcedures.has(procedureName);
	}

	shutdown(): Effect.Effect<void, never, PluginLoggerTag> {
		const self = this;
		return Effect.gen(function* () {
			const logger = yield* PluginLoggerTag;
			yield* logger.logDebug("Shutting down source plugin", {
				pluginId: self.id,
			});
			self.config = null;
			self.client = null;
		});
	}
}

export default SourceTemplatePlugin;

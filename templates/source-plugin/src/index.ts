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
		if (!this.client) {
			throw new Error("Plugin not initialized");
		}

		// Get page number from state passed through context, default to 1
		const currentPage = context.state?.page ?? 1;
		const limit = input.limit || 10;

		// Mock API call with pagination
		const mockApiResults = Array.from({ length: Math.min(limit, 2) }, (_, i) => ({
			apiId: `${input.query}_${currentPage}_${i + 1}`,
			title: `Result ${currentPage}.${i + 1} for "${input.query}"`,
			content: `This is mock content for page ${currentPage}, item ${i + 1}, query: ${input.query}`,
			timestamp: new Date().toISOString(),
		}));

		// Simulate pagination - stop after page 3
		const hasMorePages = currentPage < 3;

		return {
			items: mockApiResults.map(item => ({
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
			nextState: hasMorePages ? { page: currentPage + 1 } : null,
		};
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

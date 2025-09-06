import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { Effect } from "effect";
import {
	ConfigurationError,
	createConfigSchema,
	createStateSchema,
	SimplePlugin
} from "every-plugin";
import { z } from "zod";
import { SourceTemplateClient } from "./client";

// Configuration schemas
const VariablesSchema = z.object({
	baseUrl: z.string().default("http://localhost:1337"),
	timeout: z.number().optional(),
});

const SecretsSchema = z.object({
	apiKey: z.string(),
});

const SourceTemplateConfigSchema = createConfigSchema(VariablesSchema, SecretsSchema);
type SourceTemplateConfig = z.infer<typeof SourceTemplateConfigSchema>;

// State schema for pagination (used in contract-based input generation)
export const StateSchema = createStateSchema(
	z.object({
		phase: z.string(),
		status: z.string().optional(),
		jobId: z.string().optional(),
		lastId: z.string().optional(),
	})
).nullable();

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

// Contract definition for the source plugin
export const sourceContract = {
	// Single item fetch by ID
	getById: oc
		.input(z.object({
			id: z.string()
		}))
		.output(z.object({
			item: sourceItemSchema
		})),

	// Streamable search operation
	search: oc
		.input(z.object({
			query: z.string(),
			limit: z.number().optional(),
		}))
		.output(z.object({
			items: z.array(sourceItemSchema),
			nextState: StateSchema
		})),

	// Bulk fetch operation
	getBulk: oc
		.input(z.object({
			ids: z.array(z.string()),
		}))
		.output(z.object({
			items: z.array(sourceItemSchema),
		})),
};

// Export types for use in implementation
export type SourceContract = typeof sourceContract;
export type SourceItem = z.infer<typeof sourceItemSchema>;

// Add missing helper functions
function generateHistoricalItems(query: string, limit?: number) {
	// Handle special test cases
	if (query === "empty-results" || limit === 0) {
		return [];
	}
	
	const count = limit !== undefined ? Math.min(limit, 3) : 3;
	return Array.from({ length: count }, (_, i) => ({
		externalId: `hist_${query}_${i}`,
		content: `Historical ${query} item ${i}`,
		contentType: "post",
		createdAt: new Date().toISOString(),
		url: `https://example.com/hist/${i}`,
		authors: [{ username: "hist_user", displayName: "Historical User" }],
		raw: { type: "historical", index: i, query }
	}));
}

function generateRealtimeItems(query: string, lastId: string, limit?: number) {
	// Handle special test cases
	if (query === "empty-results" || limit === 0) {
		return [];
	}
	
	// For mixed-results, sometimes return empty to test stopWhenEmpty=false
	if (query === "mixed-results" && Math.random() < 0.5) {
		return [];
	}
	
	// Return 0-2 random items to simulate real-time activity
	const maxCount = limit !== undefined ? Math.min(limit, 2) : 2;
	const count = Math.floor(Math.random() * (maxCount + 1));
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

export class SourceTemplatePlugin extends SimplePlugin<
	typeof sourceContract,
	typeof SourceTemplateConfigSchema,
	typeof StateSchema
> {
	readonly id = "test-plugin" as const;
	readonly type = "source" as const; // this is where the open api spec of the contract should be stored, asset
	readonly contract = sourceContract;
	readonly configSchema = SourceTemplateConfigSchema;
	override readonly stateSchema = StateSchema;

	// Export contract for client consumption
	static readonly contract = sourceContract;

	private client: SourceTemplateClient | null = null;

	// Initialize the client - called by runtime after validation
	override initialize(config?: SourceTemplateConfig) {
		const self = this;
		return Effect.gen(function* () {
			if (!config?.secrets?.apiKey) {
				return yield* Effect.fail(new ConfigurationError("API key is required"));
			}

			// Initialize SourceTemplate client
			self.client = new SourceTemplateClient(
				config.variables?.baseUrl || "http://localhost:1337",
				config.secrets.apiKey,
			);

			// Test connection
			yield* Effect.tryPromise({
				try: () => self.client!.healthCheck(),
				catch: (error) => new ConfigurationError(`Health check failed: ${error instanceof Error ? error.message : String(error)}`)
			});
		});
	}

	override shutdown() {
		this.client = null;
		return Effect.void;
	}

	// Create pure oRPC router following oRPC docs pattern
	createRouter() {
		const self = this;

		// State injection middleware for streaming procedures
		const stateMiddleware = implement(sourceContract)
			.$context<{ state?: z.infer<typeof StateSchema> }>()
			.middleware(async ({ context, next }) => {
				console.log(`[TEST-PLUGIN] Middleware called with context:`, JSON.stringify(context, null, 2));
				const result = await next({
					context: {
						state: context.state
					}
				});
				console.log(`[TEST-PLUGIN] Middleware completed`);
				return result;
			});

		const os = implement(sourceContract);

		// Define individual procedure handlers
		const getById = os.getById.handler(async ({ input }) => {
			if (!self.client) {
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

		const search = os.use(stateMiddleware).search.handler(async ({ input, context }) => {
			const state = context.state;

			// Phase 1: Initial call - return immediate results and set up for streaming
			if (!state) {
				console.log(`[TEST-PLUGIN] Initial call for query: ${input.query}, limit: ${input.limit}`);
				const initialItems = generateHistoricalItems(input.query, input.limit);
				return {
					items: initialItems, // Return items immediately for single-call compatibility
					nextState: {
						nextPollMs: 50, // Short delay for testing
						phase: "historical",
						jobId: `hist_${Date.now()}`,
						lastId: initialItems.length > 0 ? initialItems[initialItems.length - 1].externalId : undefined,
					}
				};
			}

			// Phase 2: Historical data collection (simulate catching up)
			if (state.phase === "historical") {
				console.log(`[TEST-PLUGIN] Historical phase`);
				const historicalItems = generateHistoricalItems(input.query, input.limit);
				return {
					items: historicalItems,
					nextState: {
						nextPollMs: 50, // Short delay for testing
						phase: "realtime",
						jobId: state.jobId,
						lastId: historicalItems.length > 0 ? historicalItems[historicalItems.length - 1].externalId : state.lastId,
					}
				};
			}

			// Phase 3: Real-time polling (simulate ongoing data) - runs forever
			if (state.phase === "realtime") {
				console.log(`[TEST-PLUGIN] Realtime phase`);
				const newItems = generateRealtimeItems(input.query, state.lastId || "", input.limit);

				// Continue indefinitely - let maxInvocations stop the stream
				return {
					items: newItems,
					nextState: {
						nextPollMs: 50, // Short delay for testing
						phase: "realtime",
						jobId: state.jobId,
						lastId: newItems.length > 0 ? newItems[newItems.length - 1].externalId : state.lastId,
					}
				};
			}

			// Fallback - should not reach here in normal operation
			console.log(`[TEST-PLUGIN] Fallback case, phase: ${state?.phase}`);
			return {
				items: [],
				nextState: {
					nextPollMs: 50,
					phase: "realtime",
					jobId: state?.jobId || `fallback_${Date.now()}`,
					lastId: state?.lastId,
				}
			};
		});

		const getBulk = os.getBulk.handler(async ({ input }) => {
			if (!self.client) {
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

		// Return pure oRPC router following oRPC docs pattern
		return os.router({
			getById,
			search,
			getBulk,
		});
	}

}

export default SourceTemplatePlugin;

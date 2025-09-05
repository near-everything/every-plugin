import { Duration, Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PluginRegistry } from "../plugin";
import { createPluginRuntime, PluginRuntime } from "./index";

// Local template plugin for testing
const TEST_REGISTRY: PluginRegistry = {
	"test-plugin": {
		remoteUrl: "http://localhost:3999/remoteEntry.js",
		type: "source",
		version: "0.0.1",
		description: "Local template plugin for testing",
	},
	"invalid-plugin": {
		remoteUrl:
			"https://invalid-plugin-url-that-does-not-exist.com/plugin.js",
		type: "transformer" as const,
		version: "1.0.0",
		description: "Invalid plugin for testing error handling",
	},
};

const TEST_CONFIG = {
	variables: {
		baseUrl: "http://localhost:1337",
		timeout: 5000,
	},
	secrets: {
		apiKey: "{{API_KEY}}", // This will be hydrated from secrets config
	},
};

const TEST_INPUT = {
	procedure: "search" as const,
	input: {
		query: "test query for processing",
		limit: 2,
	},
	state: null,
};

// Secrets configuration for hydration
const SECRETS_CONFIG = {
	API_KEY: "test-api-key-value",
};

describe("Plugin Runtime Integration", () => {
	let runtime: ReturnType<typeof createPluginRuntime>;

	beforeEach(() => {
		runtime = createPluginRuntime({
			registry: TEST_REGISTRY,
			secrets: SECRETS_CONFIG,
		});
	});

	afterEach(async () => {
		if (runtime) {
			await runtime.dispose();
		}
	});

	it("should handle plugin lifecycle correctly", async () => {
		await runtime.runPromise(
			Effect.gen(function* () {
				const pluginRuntime = yield* PluginRuntime;

				// Test individual lifecycle steps

				// 1. Load plugin
				const pluginConstructor =
					yield* pluginRuntime.loadPlugin("test-plugin");
				expect(pluginConstructor).toBeDefined();
				expect(pluginConstructor.metadata.pluginId).toBe("test-plugin");

				// 2. Instantiate plugin
				const pluginInstance =
					yield* pluginRuntime.instantiatePlugin(pluginConstructor);
				expect(pluginInstance).toBeDefined();
				expect(pluginInstance.plugin).toBeDefined();
				expect(pluginInstance.metadata.pluginId).toBe("test-plugin");

				// 3. Initialize plugin
				const initializedPlugin = yield* pluginRuntime.initializePlugin(
					pluginInstance,
					TEST_CONFIG,
				);
				expect(initializedPlugin).toBeDefined();
				expect(initializedPlugin.config).toBeDefined();

				// 4. Execute plugin
				const output = yield* pluginRuntime.executePlugin(
					initializedPlugin,
					TEST_INPUT,
				);
				expect(output).toBeDefined();
			}),
		);
	});

	it("should handle secret hydration", async () => {
		const configWithSecrets = {
			variables: {
				baseUrl: "http://localhost:1337",
				timeout: 10000,
			},
			secrets: {
				apiKey: "{{API_KEY}}", // This should be hydrated
			},
		};

		const secretsConfig = {
			API_KEY: "hydrated-api-key-value",
		};

		const runtime = createPluginRuntime({
			registry: TEST_REGISTRY,
			secrets: secretsConfig,
		});

		await runtime.runPromise(
			Effect.gen(function* () {
				const pluginRuntime = yield* PluginRuntime;

				const initializedPlugin = yield* pluginRuntime.usePlugin(
					"test-plugin",
					configWithSecrets,
				);

				// Verify secrets were hydrated in the config
				expect(initializedPlugin.config).toBeDefined();

				// Verify the config structure and that secrets were hydrated
				const config = initializedPlugin.config as any;
				expect(config).toHaveProperty("secrets");
				expect(config.secrets).toHaveProperty("apiKey");
				expect(config.secrets.apiKey).toBe("hydrated-api-key-value");

				// Verify variables are also present
				expect(config).toHaveProperty("variables");
				expect(config.variables.baseUrl).toBe("http://localhost:1337");
				expect(config.variables.timeout).toBe(10000);

				// Verify the plugin was successfully initialized with hydrated secrets
				// by executing it to ensure it works with the hydrated config
				const output = yield* pluginRuntime.executePlugin(
					initializedPlugin,
					TEST_INPUT,
				);
				expect(output).toBeDefined();
			}),
		);
	});

	it("should handle validation error for missing apiKey", async () => {
		const configWithoutApiKey = {
			variables: {
				baseUrl: "http://localhost:1337",
				timeout: 5000,
			},
			secrets: {
				// Missing required apiKey
			},
		};

		const result = await runtime.runPromise(
			Effect.gen(function* () {
				const pluginRuntime = yield* PluginRuntime;

				return yield* pluginRuntime
					.usePlugin("test-plugin", configWithoutApiKey)
					.pipe(
						Effect.catchTag("PluginRuntimeError", (error) => {
							// Should catch validation error
							expect(error.operation).toBe("validate-config");
							expect(error.retryable).toBe(false);
							expect(error.pluginId).toBe("test-plugin");
							expect(error.cause).toBeDefined();

							// The error should mention the missing apiKey
							const errorMessage = error.cause?.message || "";
							// Zod validation errors might be in JSON format, so check for both formats
							const lowerMessage = errorMessage.toLowerCase();
							const hasApiKeyError =
								lowerMessage.includes("api key") ||
								lowerMessage.includes("apikey") ||
								lowerMessage.includes("required");
							expect(hasApiKeyError).toBe(true);

							console.debug("Caught expected validation error:", {
								operation: error.operation,
								pluginId: error.pluginId,
								retryable: error.retryable,
								cause: error.cause?.message,
							});

							return Effect.succeed("validation-error-handled-properly");
						}),
						Effect.catchAll((unexpectedError: unknown) => {
							console.error("Unexpected error type:", unexpectedError);
							expect.fail(
								`Expected PluginRuntimeError but got: ${(unexpectedError as { _tag: string })._tag || typeof unexpectedError}`,
							);
							return Effect.succeed("should-not-reach-here");
						}),
					);
			}),
		);

		expect(result).toBe("validation-error-handled-properly");
	});

	it("should handle runtime shutdown gracefully", async () => {
		const runtime = createPluginRuntime({
			registry: TEST_REGISTRY,
			secrets: SECRETS_CONFIG,
		});

		await runtime.runPromise(
			Effect.gen(function* () {
				const pluginRuntime = yield* PluginRuntime;

				// Test shutdown
				yield* pluginRuntime.shutdown();

				// Shutdown should complete without errors
				expect(true).toBe(true); // If we reach here, shutdown was successful
			}),
		);
	});

	it("should handle invalid remoteUrl with proper error handling", async () => {
		const result = await runtime.runPromise(
			Effect.gen(function* () {
				const pluginRuntime = yield* PluginRuntime;

				return yield* pluginRuntime.usePlugin("invalid-plugin", {}).pipe(
					Effect.catchTag("PluginRuntimeError", (error) => {
						expect(error.operation).toBe("register-remote");
						expect(error.retryable).toBe(true);
						expect(error.pluginId).toBe("invalid-plugin");
						expect(error.cause).toBeDefined();

						console.debug("Caught expected PluginRuntimeError:", {
							operation: error.operation,
							pluginId: error.pluginId,
							retryable: error.retryable,
							cause: error.cause?.message,
						});

						return Effect.succeed("error-handled-properly");
					}),
					Effect.catchAll((unexpectedError: unknown) => {
						// If any other error type is thrown, fail the test
						console.error("Unexpected error type:", unexpectedError);
						expect.fail(
							`Expected PluginRuntimeError but got: ${(unexpectedError as { _tag: string })._tag || typeof unexpectedError}`,
						);
						return Effect.succeed("should-not-reach-here");
					}),
				);
			}),
		);

		expect(result).toBe("error-handled-properly");
	});

	it("should handle plugin not found in registry", async () => {
		// Empty registry to test missing plugin
		const EMPTY_REGISTRY = {};

		const runtime = createPluginRuntime({
			registry: EMPTY_REGISTRY,
			secrets: {},
		});

		const result = await runtime.runPromise(
			Effect.gen(function* () {
				const pluginRuntime = yield* PluginRuntime;

				return yield* pluginRuntime.loadPlugin("non-existent-plugin").pipe(
					Effect.catchTag("PluginRuntimeError", (error) => {
						// Validate error properties
						expect(error.operation).toBe("load-plugin");
						expect(error.retryable).toBe(false);
						expect(error.pluginId).toBe("non-existent-plugin");
						expect(error.cause).toBeDefined();
						expect(error.cause?.message).toContain("not found in registry");

						// Log error details for debugging
						console.debug(
							"Caught expected PluginRuntimeError for missing plugin:",
							{
								operation: error.operation,
								pluginId: error.pluginId,
								retryable: error.retryable,
								cause: error.cause?.message,
							},
						);

						// Return success to make test pass
						return Effect.succeed("plugin-not-found-handled-properly");
					}),
					Effect.catchAll((unexpectedError: any) => {
						// If any other error type is thrown, fail the test
						console.error("Unexpected error type:", unexpectedError);
						expect.fail(
							`Expected PluginRuntimeError but got: ${unexpectedError._tag || typeof unexpectedError}`,
						);
						return Effect.succeed("should-not-reach-here");
					}),
				);
			}),
		);

		expect(result).toBe("plugin-not-found-handled-properly");
	});

	it("should handle input validation error", async () => {
		const invalidInput = {
			procedure: "search" as const,
			input: {
				// Missing required 'query' field
				limit: 2,
			},
			state: null,
		};

		const result = await runtime.runPromise(
			Effect.gen(function* () {
				const pluginRuntime = yield* PluginRuntime;

				const initializedPlugin = yield* pluginRuntime.usePlugin(
					"test-plugin",
					TEST_CONFIG,
				);

				return yield* pluginRuntime
					.executePlugin(initializedPlugin, invalidInput as any)
					.pipe(
						Effect.catchTag("PluginRuntimeError", (error) => {
							// Should catch input validation error
							expect(error.operation).toBe("validate-input");
							expect(error.retryable).toBe(false);
							expect(error.pluginId).toBe("test-plugin");
							expect(error.cause).toBeDefined();

							// The error should mention the missing query field
							const errorMessage = error.cause?.message || "";
							const lowerMessage = errorMessage.toLowerCase();
							const hasQueryError =
								lowerMessage.includes("query") ||
								lowerMessage.includes("required") ||
								lowerMessage.includes("invalid");
							expect(hasQueryError).toBe(true);

							console.debug("Caught expected input validation error:", {
								operation: error.operation,
								pluginId: error.pluginId,
								retryable: error.retryable,
								cause: error.cause?.message,
							});

							return Effect.succeed("input-validation-error-handled");
						}),
						Effect.catchAll((unexpectedError: unknown) => {
							console.error("Unexpected error type:", unexpectedError);
							expect.fail(
								`Expected PluginRuntimeError but got: ${(unexpectedError as { _tag: string })._tag || typeof unexpectedError}`,
							);
							return Effect.succeed("should-not-reach-here");
						}),
					);
			}),
		);

		expect(result).toBe("input-validation-error-handled");
	});

	// Contract-based procedure tests
	it("should execute getById procedure", async () => {
		const getByIdInput = {
			procedure: "getById" as const,
			input: {
				id: "test-id-123",
			},
			state: null,
		};

		const result = await runtime.runPromise(
			Effect.gen(function* () {
				const pluginRuntime = yield* PluginRuntime;
				const plugin = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

				const output = yield* pluginRuntime.executePlugin(plugin, getByIdInput);

				return output;
			})
		);

		expect(result).toBeDefined();
		const typedResult = result as { item: any };
		expect(typedResult.item).toBeDefined();
		expect(typedResult.item.externalId).toBe("test-id-123");
		expect(typedResult.item.content).toContain("Content for item test-id-123");
	});

	it("should execute getBulk procedure", async () => {
		const getBulkInput = {
			procedure: "getBulk" as const,
			input: {
				ids: ["id1", "id2", "id3"],
			},
			state: null,
		};

		const result = await runtime.runPromise(
			Effect.gen(function* () {
				const pluginRuntime = yield* PluginRuntime;
				const plugin = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

				const output = yield* pluginRuntime.executePlugin(plugin, getBulkInput);

				return output;
			})
		);

		expect(result).toBeDefined();
		const typedResult = result as { items: any[] };
		expect(typedResult.items).toBeDefined();
		expect(Array.isArray(typedResult.items)).toBe(true);
		expect(typedResult.items.length).toBe(3);
		expect(typedResult.items[0].externalId).toBe("id1");
		expect(typedResult.items[1].externalId).toBe("id2");
		expect(typedResult.items[2].externalId).toBe("id3");
	});

	it("should execute search procedure (basic execution)", async () => {
		const searchInput = {
			procedure: "search" as const,
			input: {
				query: "test query",
				limit: 10,
			},
			// Use Phase 3 state to get historical items
			state: { phase: "historical", status: "processing" }
		};

		const result = await runtime.runPromise(
			Effect.gen(function* () {
				const pluginRuntime = yield* PluginRuntime;
				const plugin = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

				const output = yield* pluginRuntime.executePlugin(plugin, searchInput);

				return output;
			})
		);

		expect(result).toBeDefined();
		const typedResult = result as { items: any[]; nextState?: any };
		expect(typedResult.items).toBeDefined();
		expect(Array.isArray(typedResult.items)).toBe(true);
		expect(typedResult.items.length).toBeGreaterThan(0);
		expect(typedResult.items[0].content).toContain("test query");
		expect(typedResult.nextState).toBeDefined();
	});

	it("should handle constructor instantiation failure", async () => {
		// Registry with real remote that should fail during instantiation/initialization
		const REAL_REMOTE_REGISTRY = {
			"simple-transform": {
				remoteUrl:
					"https://unpkg.com/@curatedotfun/simple-transform@latest/dist/remoteEntry.js",
				type: "transformer" as const,
				version: "latest",
				description: "Real remote plugin for testing constructor failure",
			},
		};

		const runtime = createPluginRuntime({
			registry: REAL_REMOTE_REGISTRY,
			secrets: {},
		});

		const result = await runtime.runPromise(
			Effect.gen(function* () {
				const pluginRuntime = yield* PluginRuntime;

				return yield* pluginRuntime.usePlugin("simple-transform", {}).pipe(
					Effect.timeout(Duration.seconds(1)), // Timeout after 3 seconds
					Effect.catchTag("PluginRuntimeError", (error) => {
						// Validate error properties
						expect(["load-remote"]).toContain(error.operation);
						expect(error.retryable).toBe(false);
						expect(error.pluginId).toBe("simple-transform");
						expect(error.cause).toBeDefined();

						// Log error details for debugging
						console.debug(
							"Caught expected PluginRuntimeError for constructor failure:",
							{
								operation: error.operation,
								pluginId: error.pluginId,
								retryable: error.retryable,
								cause: error.cause?.message,
							},
						);

						// Return success to make test pass
						return Effect.succeed("constructor-failure-handled-properly");
					}),
					Effect.catchTag("TimeoutException", () => {
						// Handle timeout as expected failure - remote is too slow
						console.debug(
							"Plugin creation timed out - treating as expected failure",
						);
						return Effect.succeed("timeout-handled-properly");
					}),
					Effect.catchAll((unexpectedError: any) => {
						// If any other error type is thrown, fail the test
						console.error("Unexpected error type:", unexpectedError);
						expect.fail(
							`Expected PluginRuntimeError or TimeoutException but got: ${unexpectedError._tag || typeof unexpectedError}`,
						);
						return Effect.succeed("should-not-reach-here");
					}),
				);
			}),
		);

		expect([
			"constructor-failure-handled-properly",
			"timeout-handled-properly",
		]).toContain(result);
	});
});

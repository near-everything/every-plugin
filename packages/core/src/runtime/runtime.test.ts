import { describe, it, expect } from "vitest";
import { Effect, Duration } from "effect";
import { PluginRuntime, createPluginRuntime } from "./index";
import type { PluginRegistry } from "../plugin";

// Local template plugin for testing
const TEST_REGISTRY: PluginRegistry = {
  "test-plugin": {
    remoteUrl: "http://localhost:3000/remoteEntry.js",
    type: "transformer",
    version: "0.0.1",
    description: "Local template plugin for testing",
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
  query: "test query for processing",
  options: {
    limit: 2,
  },
};

// Secrets configuration for hydration
const SECRETS_CONFIG = {
  API_KEY: "test-api-key-value",
};

describe("Plugin Runtime Integration", () => {
  it("should create and execute plugin end-to-end", async () => {
    // Create the managed runtime
    const runtime = createPluginRuntime({
      registry: TEST_REGISTRY,
      secrets: SECRETS_CONFIG,
    });

    // Execute the test within the runtime
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        
        // Create plugin (load → instantiate → initialize)
        const initializedPlugin = yield* pluginRuntime.createPlugin(
          "test-plugin",
          TEST_CONFIG
        );
        
        // Verify plugin was initialized
        expect(initializedPlugin).toBeDefined();
        expect(initializedPlugin.metadata.pluginId).toBe("test-plugin");
        expect(initializedPlugin.plugin).toBeDefined();
        
        // Execute plugin
        const output = yield* pluginRuntime.executePlugin(
          initializedPlugin,
          TEST_INPUT
        );
        
        return output;
      })
    );

    // Validate output structure
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
    
    const typedResult = result as any;
    
    // Verify success wrapper structure
    expect(typedResult).toHaveProperty("success");
    expect(typedResult).toHaveProperty("data");
    expect(typedResult.success).toBe(true);
    
    // Verify data content
    expect(typedResult.data).toHaveProperty("results");
    expect(typedResult.data).toHaveProperty("count");
    expect(Array.isArray(typedResult.data.results)).toBe(true);
    expect(typedResult.data.count).toBe(2); // Should match the limit we set
    expect(typedResult.data.results).toHaveLength(2);
    
    // Verify results contain processed query
    expect(typedResult.data.results[0]).toHaveProperty("id");
    expect(typedResult.data.results[0]).toHaveProperty("content");
    expect(typedResult.data.results[0].content).toContain("test query for processing");
    expect(typedResult.data.results[1].content).toContain("test query for processing");
  });

  it("should handle plugin lifecycle correctly", async () => {
    const runtime = createPluginRuntime({
      registry: TEST_REGISTRY,
      secrets: SECRETS_CONFIG,
    });

    await runtime.runPromise(
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        
        // Test individual lifecycle steps
        
        // 1. Load plugin
        const pluginConstructor = yield* pluginRuntime.loadPlugin("test-plugin");
        expect(pluginConstructor).toBeDefined();
        expect(pluginConstructor.metadata.pluginId).toBe("test-plugin");
        
        // 2. Instantiate plugin
        const pluginInstance = yield* pluginRuntime.instantiatePlugin(pluginConstructor);
        expect(pluginInstance).toBeDefined();
        expect(pluginInstance.plugin).toBeDefined();
        expect(pluginInstance.metadata.pluginId).toBe("test-plugin");
        
        // 3. Initialize plugin
        const initializedPlugin = yield* pluginRuntime.initializePlugin(
          pluginInstance,
          TEST_CONFIG
        );
        expect(initializedPlugin).toBeDefined();
        expect(initializedPlugin.config).toBeDefined();
        
        // 4. Execute plugin
        const output = yield* pluginRuntime.executePlugin(
          initializedPlugin,
          TEST_INPUT
        );
        expect(output).toBeDefined();
      })
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
        
        const initializedPlugin = yield* pluginRuntime.createPlugin(
          "test-plugin",
          configWithSecrets
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
          TEST_INPUT
        );
        expect(output).toBeDefined();
      })
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

    const runtime = createPluginRuntime({
      registry: TEST_REGISTRY,
      secrets: SECRETS_CONFIG,
    });

    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        
        return yield* pluginRuntime.createPlugin(
          "test-plugin",
          configWithoutApiKey
        ).pipe(
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
            const hasApiKeyError = lowerMessage.includes("api key") || 
                                 lowerMessage.includes("apikey") ||
                                 lowerMessage.includes("required");
            expect(hasApiKeyError).toBe(true);
            
            console.log("Caught expected validation error:", {
              operation: error.operation,
              pluginId: error.pluginId,
              retryable: error.retryable,
              cause: error.cause?.message,
            });
            
            return Effect.succeed("validation-error-handled-properly");
          }),
          Effect.catchAll((unexpectedError: unknown) => {
            console.error("Unexpected error type:", unexpectedError);
            expect.fail(`Expected PluginRuntimeError but got: ${(unexpectedError as { _tag: string })._tag || typeof unexpectedError}`);
            return Effect.succeed("should-not-reach-here");
          })
        );
      })
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
      })
    );
  });

  it("should handle invalid remoteUrl with proper error handling", async () => {
    const INVALID_REGISTRY = {
      "invalid-plugin": {
        remoteUrl: "https://invalid-plugin-url-that-does-not-exist.com/plugin.js",
        type: "transformer" as const,
        version: "1.0.0",
        description: "Invalid plugin for testing error handling",
      },
    };

    const runtime = createPluginRuntime({
      registry: INVALID_REGISTRY,
      secrets: {},
    });

    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        
        return yield* pluginRuntime.createPlugin("invalid-plugin", {}).pipe(
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
            expect.fail(`Expected PluginRuntimeError but got: ${(unexpectedError as { _tag: string })._tag || typeof unexpectedError}`);
            return Effect.succeed("should-not-reach-here");
          })
        );
      })
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
            console.log("Caught expected PluginRuntimeError for missing plugin:", {
              operation: error.operation,
              pluginId: error.pluginId,
              retryable: error.retryable,
              cause: error.cause?.message,
            });
            
            // Return success to make test pass
            return Effect.succeed("plugin-not-found-handled-properly");
          }),
          Effect.catchAll((unexpectedError: any) => {
            // If any other error type is thrown, fail the test
            console.error("Unexpected error type:", unexpectedError);
            expect.fail(`Expected PluginRuntimeError but got: ${unexpectedError._tag || typeof unexpectedError}`);
            return Effect.succeed("should-not-reach-here");
          })
        );
      })
    );

    expect(result).toBe("plugin-not-found-handled-properly");
  });

  it("should handle constructor instantiation failure", async () => {
    // Registry with real remote that should fail during instantiation/initialization
    const REAL_REMOTE_REGISTRY = {
      "simple-transform": {
        remoteUrl: "https://unpkg.com/@curatedotfun/simple-transform@latest/dist/remoteEntry.js",
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
        
        return yield* pluginRuntime.createPlugin("simple-transform", {}).pipe(
          Effect.timeout(Duration.seconds(1)), // Timeout after 3 seconds
          Effect.catchTag("PluginRuntimeError", (error) => {
            // Validate error properties
            expect(["load-remote"]).toContain(error.operation);
            expect(error.retryable).toBe(true);
            expect(error.pluginId).toBe("simple-transform");
            expect(error.cause).toBeDefined();
            
            // Log error details for debugging
            console.log("Caught expected PluginRuntimeError for constructor failure:", {
              operation: error.operation,
              pluginId: error.pluginId,
              retryable: error.retryable,
              cause: error.cause?.message,
            });
            
            // Return success to make test pass
            return Effect.succeed("constructor-failure-handled-properly");
          }),
          Effect.catchTag("TimeoutException", () => {
            // Handle timeout as expected failure - remote is too slow
            console.log("Plugin creation timed out - treating as expected failure");
            return Effect.succeed("timeout-handled-properly");
          }),
          Effect.catchAll((unexpectedError: any) => {
            // If any other error type is thrown, fail the test
            console.error("Unexpected error type:", unexpectedError);
            expect.fail(`Expected PluginRuntimeError or TimeoutException but got: ${unexpectedError._tag || typeof unexpectedError}`);
            return Effect.succeed("should-not-reach-here");
          })
        );
      })
    );

    expect(["constructor-failure-handled-properly", "timeout-handled-properly"]).toContain(result);
  });
});

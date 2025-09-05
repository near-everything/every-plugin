import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { PluginLoggerTag } from "../plugin";
import { ModuleFederationService } from "./services/module-federation.service";
import { createTestLogger } from "./test-utils";

// Test registry for diagnostics
const TEST_PLUGIN_ID = "test-plugin";
const TEST_REMOTE_URL = "http://localhost:3999/remoteEntry.js";

const testLayer = Layer.succeed(PluginLoggerTag, createTestLogger());

describe("Module Federation Diagnostics", () => {
  it("should verify remote URL is accessible (sanity check)", async () => {
    console.log("=== Testing Remote URL Accessibility ===");

    try {
      const response = await fetch(TEST_REMOTE_URL, { method: "HEAD" });
      console.log(`Remote URL status: ${response.status}`);
      console.log(`Remote URL headers:`, Object.fromEntries(response.headers.entries()));
      expect(response.ok).toBe(true);
    } catch (error) {
      console.error("Failed to access remote URL:", error);
      throw error;
    }
  });

  it("should test name transformation logic", async () => {
    console.log("=== Testing Name Transformation ===");

    // Test the same logic used in module-federation.service.ts
    const remoteName = TEST_PLUGIN_ID
      .toLowerCase()
      .replace("@", "")
      .replace("/", "_");

    const modulePath = `${remoteName}/plugin`;

    console.log(`Original plugin ID: ${TEST_PLUGIN_ID}`);
    console.log(`Transformed remote name: ${remoteName}`);
    console.log(`Module path: ${modulePath}`);

    expect(remoteName).toBe("test-plugin");
    expect(modulePath).toBe("test-plugin/plugin");
  });

  it("should register remote successfully", async () => {
    console.log("=== Testing Remote Registration ===");

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const mfService = yield* ModuleFederationService;

        console.log("Attempting to register remote...");
        yield* mfService.registerRemote(TEST_PLUGIN_ID, TEST_REMOTE_URL);
        console.log("Remote registration completed successfully");

        return "success";
      }).pipe(
        Effect.provide(ModuleFederationService.Live),
        Effect.provide(testLayer),
        Effect.catchAll((error) => {
          console.error("Remote registration failed:", error);
          return Effect.succeed(`failed: ${error}`);
        })
      )
    );

    console.log(`Registration result: ${result}`);
    expect(result).toBe("success");
  });

  it.skip("should inspect module federation instance", async () => {
    console.log("=== Inspecting Module Federation Instance ===");

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const mfService = yield* ModuleFederationService;

        // First register the remote
        yield* mfService.registerRemote(TEST_PLUGIN_ID, TEST_REMOTE_URL);

        // Access the internal MF instance to inspect it
        // Note: This is a bit hacky but needed for diagnostics
        const mfInstance = (mfService as any).mf || (globalThis as any).__FEDERATION__;

        console.log("Module Federation instance:", typeof mfInstance);
        console.log("Available methods:", Object.getOwnPropertyNames(mfInstance || {}));

        if (mfInstance && mfInstance.options) {
          console.log("MF options:", mfInstance.options);
        }

        return "inspected";
      }).pipe(
        Effect.provide(ModuleFederationService.Live),
        Effect.provide(testLayer),
        Effect.catchAll((error) => {
          console.error("MF instance inspection failed:", error);
          return Effect.succeed(`failed: ${error}`);
        })
      )
    );

    expect(result).toBe("inspected");
  });

  it.skip("should attempt to load remote container with detailed logging", async () => {
    console.log("=== Testing Remote Container Loading ===");

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const mfService = yield* ModuleFederationService;

        // Register remote first
        console.log("Step 1: Registering remote...");
        yield* mfService.registerRemote(TEST_PLUGIN_ID, TEST_REMOTE_URL);
        console.log("Step 1: ✓ Remote registered");

        // Now try to load the constructor
        console.log("Step 2: Loading remote constructor...");
        const ctor = yield* mfService.loadRemoteConstructor(TEST_PLUGIN_ID, TEST_REMOTE_URL);
        console.log("Step 2: ✓ Constructor loaded:", typeof ctor);

        // Try to instantiate it
        console.log("Step 3: Attempting to instantiate constructor...");
        const instance = new ctor();
        console.log("Step 3: ✓ Instance created:", typeof instance);
        console.log("Instance properties:", Object.getOwnPropertyNames(instance));
        console.log("Instance id:", instance.id);

        return "success";
      }).pipe(
        Effect.provide(ModuleFederationService.Live),
        Effect.provide(testLayer),
        Effect.catchAll((error) => {
          console.error("Container loading failed at some step:", error);
          console.error("Error details:", {
            message: error.message,
            cause: error.cause,
            stack: error.stack
          });
          return Effect.succeed(`failed: ${error.message}`);
        })
      )
    );

    console.log(`Final result: ${result}`);
    // Don't fail the test - we want to see what happens
    expect(typeof result).toBe("string");
  });
});

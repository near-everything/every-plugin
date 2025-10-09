import { describe, expect, it } from "vitest";
import { createLocalPluginRuntime } from "../../src/testing";
import TestPlugin from "../test-plugin/src/index";

const TEST_PLUGIN_MAP = {
  "test-plugin": TestPlugin,
} as const;

const TEST_CONFIG = {
  variables: {
    baseUrl: "http://localhost:1337",
    timeout: 5000,
  },
  secrets: {
    apiKey: "test-api-key-value",
  },
};

describe("Plugin Lifecycle Unit Tests", () => {
  const runtime = createLocalPluginRuntime({
    registry: {
      "test-plugin": {
        remoteUrl: "http://localhost:3999/remoteEntry.js",
        version: "0.0.1",
      },
    },
    secrets: {
      API_KEY: "test-api-key-value",
    },
  }, TEST_PLUGIN_MAP);

  it("should handle complete plugin lifecycle", { timeout: 4000 }, async () => {
    const pluginConstructor = await runtime.loadPlugin("test-plugin");
    expect(pluginConstructor).toBeDefined();

    const pluginInstance = await runtime.instantiatePlugin("test-plugin", pluginConstructor);
    expect(pluginInstance).toBeDefined();
    expect(pluginInstance.plugin).toBeDefined();
    expect(pluginInstance.plugin.id).toBe("test-plugin");

    const initializedPlugin = await runtime.initializePlugin(
      pluginInstance,
      TEST_CONFIG,
    );
    expect(initializedPlugin).toBeDefined();
    expect(initializedPlugin.config).toBeDefined();
    expect(initializedPlugin.config.secrets.apiKey).toBe("test-api-key-value");
  });

  it("should handle usePlugin convenience method", { timeout: 4000 }, async () => {
    const result = await runtime.usePlugin("test-plugin", TEST_CONFIG);

    expect(result).toBeDefined();
    expect(result.client).toBeDefined();
    expect(result.router).toBeDefined();
    expect(result.metadata).toBeDefined();
    expect(result.initialized).toBeDefined();
    expect(result.initialized.plugin).toBeDefined();
    expect(result.initialized.plugin.id).toBe("test-plugin");
    expect(result.initialized.config).toBeDefined();
    expect(result.initialized.config.secrets.apiKey).toBe("test-api-key-value");

    expect(typeof result.router).toBe("object");
  });

  it("should handle plugin not found in registry", { timeout: 4000 }, async () => {
    try {
      await runtime.loadPlugin("non-existent-plugin" as any);
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      console.log("Caught error:", error);  // Add this
      console.log("Error constructor:", error.constructor.name);  // And this
      console.log("Error keys:", Object.keys(error));  // And this
      expect(error.operation).toBe("validate-plugin-id");
      expect(error.retryable).toBe(false);
      expect(error.pluginId).toBe("non-existent-plugin");
      expect(error.cause?.message).toContain("not found in registry");
    }
  });

  it("should handle config validation errors", { timeout: 4000 }, async () => {
    try {
      await runtime.usePlugin("test-plugin", {
        variables: { baseUrl: "http://localhost:1337" },
        // @ts-expect-error - means the types are really good!
        secrets: {},
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error.operation).toBe("validate-config");
      expect(error.retryable).toBe(false);
      expect(error.pluginId).toBe("test-plugin");
    }
  });

  it("should handle plugin initialization errors", { timeout: 4000 }, async () => {
    try {
      await runtime.usePlugin("test-plugin", {
        variables: { baseUrl: "http://localhost:1337" },
        secrets: { apiKey: "invalid-key" },
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error.operation).toBe("initialize-plugin");
      expect(error.pluginId).toBe("test-plugin");
    }
  });

  it("should handle connection failure during initialization", { timeout: 4000 }, async () => {
    try {
      await runtime.usePlugin("test-plugin", {
        variables: { baseUrl: "http://localhost:1337" },
        secrets: { apiKey: "connection-fail" },
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error.operation).toBe("initialize-plugin");
      expect(error.pluginId).toBe("test-plugin");
      expect(error.cause).toBeDefined();
    }
  });

  it("should handle runtime shutdown gracefully", { timeout: 4000 }, async () => {
    const plugin = await runtime.usePlugin("test-plugin", TEST_CONFIG);
    expect(plugin).toBeDefined();

    await runtime.shutdown();

    expect(true).toBe(true);
  });

  it("should cache plugins with same config", { timeout: 4000 }, async () => {
    const result1 = await runtime.usePlugin("test-plugin", TEST_CONFIG);
    const result2 = await runtime.usePlugin("test-plugin", TEST_CONFIG);

    expect(result1.initialized.plugin.id).toBe(result2.initialized.plugin.id);
  });

  it("should create different instances for different configs", { timeout: 4000 }, async () => {
    const config1 = {
      variables: { baseUrl: "http://localhost:1337" },
      secrets: { apiKey: "key1" },
    };

    const config2 = {
      variables: { baseUrl: "http://localhost:1337" },
      secrets: { apiKey: "key2" },
    };

    const result1 = await runtime.usePlugin("test-plugin", config1);
    const result2 = await runtime.usePlugin("test-plugin", config2);

    expect(result1).not.toBe(result2);
    expect(result1.initialized.config.secrets.apiKey).toBe("key1");
    expect(result2.initialized.config.secrets.apiKey).toBe("key2");
  });
});

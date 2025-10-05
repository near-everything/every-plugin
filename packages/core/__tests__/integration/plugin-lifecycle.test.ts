import { expect, it } from "@effect/vitest";
import { describe } from "vitest";
import { createPluginClient } from "../../src/client/index";
import type { PluginBinding } from "../../src/plugin";
import { createPluginRuntime } from "../../src/runtime";
import type TestPlugin from "../test-plugin/src/index";
import { TEST_REMOTE_ENTRY_URL } from "./global-setup";

// Define typed registry bindings for the test plugin
type TestBindings = {
  "test-plugin": PluginBinding<typeof TestPlugin>;
};

// Test registry using the real served plugin
const TEST_REGISTRY = {
  "test-plugin": {
    remoteUrl: TEST_REMOTE_ENTRY_URL,
    version: "0.0.1",
    description: "Real test plugin for integration testing",
  },
} as const;

const TEST_CONFIG = {
  variables: {
    baseUrl: "http://localhost:1337",
    timeout: 5000
  },
  secrets: {
    apiKey: "test-api-key-value",
  },
};

const SECRETS_CONFIG = {
  API_KEY: "test-api-key-value",
};

describe("Plugin Lifecycle Integration Tests", () => {
  const pluginRuntime = createPluginRuntime<TestBindings>({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG
  });

  it("should complete full plugin lifecycle with real MF", async () => {
    const pluginConstructor = await pluginRuntime.loadPlugin("test-plugin");
    expect(pluginConstructor).toBeDefined();

    const pluginInstance = await pluginRuntime.instantiatePlugin(pluginConstructor);
    expect(pluginInstance).toBeDefined();
    expect(pluginInstance.plugin).toBeDefined();

    const initializedPlugin = await pluginRuntime.initializePlugin(
      pluginInstance,
      TEST_CONFIG,
    );
    expect(initializedPlugin).toBeDefined();
    expect(initializedPlugin.config).toBeDefined();

    const client = createPluginClient(initializedPlugin);
    const output = await client.getById({ id: "integration-test" });
    expect(output).toBeDefined();
  }, 15000);

  it("should execute getById with real plugin", async () => {
    const { client } = await pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

    const result = await client.getById({ id: "integration-test-id" });

    expect(result).toBeDefined();
    expect(result.item).toBeDefined();
    expect(result.item.externalId).toBe("integration-test-id");
    expect(result.item.content).toContain("integration-test-id");
  }, 10000);

  it("should execute getBulk with real plugin", async () => {
    const { client } = await pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

    const result = await client.getBulk({ ids: ["bulk1", "bulk2", "bulk3"] });

    expect(result).toBeDefined();
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBe(3);
    expect(result.items[0].externalId).toBe("bulk1");
    expect(result.items[1].externalId).toBe("bulk2");
    expect(result.items[2].externalId).toBe("bulk3");
  }, 10000);

  it("should handle streaming with real plugin", async () => {
    const { client } = await pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

    const result = await client.simpleStream({ count: 3, prefix: "integration" });

    expect(result).not.toBeNull();
    expect(typeof result).toBe('object');
    expect(Symbol.asyncIterator in result).toBe(true);
  }, 15000);

  it("should handle validation errors with real plugin", async () => {
    try {
      await pluginRuntime.usePlugin("test-plugin", {
        variables: { baseUrl: "http://localhost:1337" },
        // @ts-expect-error - means the types are really good!
        secrets: {}, // Missing required apiKey
      });
      expect.fail("Should have thrown PluginRuntimeError");
    } catch (error: any) {
      expect(error.operation).toBe("validate-config");
      expect(error.retryable).toBe(false);
      expect(error.pluginId).toBe("test-plugin");
    }
  }, 10000);
});

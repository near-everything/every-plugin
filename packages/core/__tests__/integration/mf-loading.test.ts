import { describe, expect, it } from "vitest";
import type { PluginBinding } from "../../src/plugin";
import { createPluginRuntime } from "../../src/runtime";
import type TestPlugin from "../test-plugin/src/index";
import { TEST_REMOTE_ENTRY_URL } from "./global-setup";

type TestBindings = {
  "test-plugin": PluginBinding<typeof TestPlugin>;
};

const TEST_REGISTRY = {
  "test-plugin": {
    remoteUrl: TEST_REMOTE_ENTRY_URL,
    type: "source",
    version: "0.0.1",
    description: "Real test plugin for integration testing",
  },
} as const;

describe("Module Federation Integration Tests", () => {
  it("should verify remote URL is accessible", async () => {
    const response = await fetch(TEST_REMOTE_ENTRY_URL, { method: "HEAD" });
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });

  it("should test name transformation logic", async () => {
    const pluginId = "test-plugin";
    const remoteName = pluginId
      .toLowerCase()
      .replace("@", "")
      .replace("/", "_");

    const modulePath = `${remoteName}/plugin`;

    expect(remoteName).toBe("test-plugin");
    expect(modulePath).toBe("test-plugin/plugin");
  });

  it("should load remote plugin constructor successfully", async () => {
    const pluginRuntime = createPluginRuntime<TestBindings>({
      registry: TEST_REGISTRY,
    });

    const ctor = await pluginRuntime.loadPlugin("test-plugin");

    expect(ctor).toBeDefined();
    expect(ctor).not.toBeNull();
  });

  it("should instantiate plugin from remote constructor", async () => {
    const pluginRuntime = createPluginRuntime<TestBindings>({
      registry: TEST_REGISTRY,
    });

    const ctor = await pluginRuntime.loadPlugin("test-plugin");
    const instance = await pluginRuntime.instantiatePlugin(ctor);

    expect(instance).toBeDefined();
    expect(instance.plugin).toBeDefined();
    expect(instance.plugin.id).toBe("test-plugin");
    expect(instance.plugin.type).toBe("source");
  });

  it("should handle invalid plugin ID gracefully", async () => {
    const pluginRuntime = createPluginRuntime<TestBindings>({
      registry: TEST_REGISTRY,
    });

    try {
      await pluginRuntime.loadPlugin("invalid-plugin" as any);
      expect.fail("Should have thrown PluginRuntimeError");
    } catch (error: any) {
      expect(error).toBeDefined();
      expect(error.pluginId).toBe("invalid-plugin");
      expect(error.operation).toBe("validate-plugin-id");
    }
  });
});

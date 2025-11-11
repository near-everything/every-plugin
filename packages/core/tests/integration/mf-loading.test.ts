import { createPluginRuntime } from "every-plugin/runtime";
import { describe, expect, it } from "vitest";
import { TEST_REGISTRY } from "../registry";
import { TEST_REMOTE_ENTRY_URL } from "../setup/global-setup";

describe("Module Federation Integration Tests", () => {
  it("should verify remote URL is accessible", async () => {
    // Check that mf-manifest.json is accessible (MF 2.0)
    const manifestUrl = `${TEST_REMOTE_ENTRY_URL}/mf-manifest.json`;
    const response = await fetch(manifestUrl, { method: "HEAD" });
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
    const pluginRuntime = createPluginRuntime({
      registry: TEST_REGISTRY,
    });

    const loadedPlugin = await pluginRuntime.loadPlugin("test-plugin");

    expect(loadedPlugin).toBeDefined();
    expect(loadedPlugin).not.toBeNull();
    expect(loadedPlugin.ctor).toBeDefined();
  });

  it("should instantiate plugin from loaded plugin", async () => {
    const pluginRuntime = createPluginRuntime({
      registry: TEST_REGISTRY,
    });

    const loadedPlugin = await pluginRuntime.loadPlugin("test-plugin");
    const instance = await pluginRuntime.instantiatePlugin("test-plugin", loadedPlugin);

    expect(instance).toBeDefined();
    expect(instance.plugin).toBeDefined();
    expect(instance.plugin.id).toBe("test-plugin");
  });

  it("should handle invalid plugin ID gracefully", async () => {
    const pluginRuntime = createPluginRuntime({
      registry: TEST_REGISTRY,
    });

    try {
      // @ts-expect-error because the id is not in the test registry
      await pluginRuntime.loadPlugin("invalid-plugin");
      expect.fail("Should have thrown PluginRuntimeError");
    } catch (error: any) {
      expect(error).toBeDefined();
      expect(error.pluginId).toBe("invalid-plugin");
      expect(error.operation).toBe("validate-plugin-id");
    }
  });
});

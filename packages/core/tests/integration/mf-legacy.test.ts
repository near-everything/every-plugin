import { describe, expect, it } from "vitest";
import { createPluginRuntime } from "../../src/runtime/index";
import { TEST_REMOTE_ENTRY_URL_LEGACY } from "../setup/global-setup";

describe("Module Federation Legacy (MF 1.5) Compatibility Tests", () => {
  it("should load remote plugin constructor using MF 1.5 remoteEntry.js", async () => {
    const runtime = createPluginRuntime({
      registry: {
        "test-plugin": {
          remoteUrl: TEST_REMOTE_ENTRY_URL_LEGACY, // Forces MF 1.5 mode
          version: "0.0.1",
          description: "Test plugin for MF 1.5 backward compatibility",
        },
      },
    });

    // This should work with MF 1.5 fallback mode
    const loaded = await runtime.loadPlugin("test-plugin");
    expect(loaded).toBeDefined();
    expect(typeof loaded).toBe("function");

    // Instantiate the plugin
    const instance = await runtime.instantiatePlugin("test-plugin", loaded);
    expect(instance).toBeDefined();
    expect(instance.plugin).toBeDefined();

    // Initialize the plugin
    const initialized = await runtime.initializePlugin(instance, {
      baseUrl: "http://localhost:3999",
      apiKey: "test-key",
    });
    expect(initialized).toBeDefined();
    expect(initialized.plugin).toBeDefined();
    expect(initialized.context).toBeDefined();
  });

  it("should handle MF 1.5 remote registration and loading", async () => {
    const runtime = createPluginRuntime({
      registry: {
        "test-plugin": {
          remoteUrl: TEST_REMOTE_ENTRY_URL_LEGACY, // Forces MF 1.5 mode
          version: "0.0.1",
          description: "Test plugin for MF 1.5 backward compatibility",
        },
      },
    });

    // Use the plugin (this will trigger registration and loading)
    const result = await runtime.usePlugin("test-plugin", {
      baseUrl: "http://localhost:3999",
      apiKey: "test-key",
    });

    expect(result).toBeDefined();
    expect(result.router).toBeDefined();
    expect(result.client).toBeDefined();
    expect(result.metadata).toBeDefined();
    expect(result.initialized).toBeDefined();
  });
});

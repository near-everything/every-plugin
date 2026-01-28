import { describe, it } from "vitest";
import type { RegisteredPlugins } from "../../src/types";

describe("Type Diagnostics", () => {
  it("should show RegisteredPlugins structure", () => {
    type Plugins = RegisteredPlugins;
    type Keys = keyof Plugins;
    type TestPlugin = Plugins extends { "test-plugin": infer T } ? T : never;

    const _plugins: Plugins = {} as any;
    const _keys: Keys = "test-plugin" as Keys;
    const _testPlugin: TestPlugin = {} as any;

    console.log("RegisteredPlugins keys:", _keys);
    console.log("RegisteredPlugins:", _plugins);
    console.log("TestPlugin type:", _testPlugin);
  });

  it("should verify augmentation is present", () => {
    const key: keyof RegisteredPlugins = "test-plugin";

    console.log("Augmentation check passed:", key);
  });
});

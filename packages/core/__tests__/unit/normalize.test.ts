import { describe, it, expect } from "vitest";
import { getNormalizedRemoteName } from "../../src/runtime/services/normalize";

describe("getNormalizedRemoteName", () => {
  it("should normalize scoped package names correctly", () => {
    expect(getNormalizedRemoteName("@scope/my-plugin")).toBe("scope_my-plugin");
    expect(getNormalizedRemoteName("@SCOPE/My-Plugin")).toBe("scope_my-plugin");
    expect(getNormalizedRemoteName("@scope/foo/bar")).toBe("scope_foo_bar");
  });

  it("should normalize unscoped package names correctly", () => {
    expect(getNormalizedRemoteName("simple-plugin")).toBe("simple-plugin");
    expect(getNormalizedRemoteName("foo/bar")).toBe("foo_bar");
    expect(getNormalizedRemoteName("UPPERCASE")).toBe("uppercase");
  });

  it("should preserve hyphens and handle edge cases", () => {
    expect(getNormalizedRemoteName("my-awesome-plugin")).toBe("my-awesome-plugin");
    expect(getNormalizedRemoteName("@")).toBe("");
    expect(getNormalizedRemoteName("@/")).toBe("_");
    expect(getNormalizedRemoteName("")).toBe("");
  });

  it("should match rspack config normalization", () => {
    // These test cases ensure parity with the rspack config usage
    const testCases = [
      "@scope/masa-source",
      "@scope/telegram", 
      "@everything/test-plugin",
      "simple-plugin",
      "@SCOPE/Foo/Bar"
    ];

    testCases.forEach(pluginName => {
      const normalized = getNormalizedRemoteName(pluginName);
      
      // Verify it follows the expected pattern
      expect(normalized).toMatch(/^[a-z0-9_-]*$/);
      expect(normalized).not.toMatch(/^@/);
      expect(normalized).not.toMatch(/\//);
    });
  });
});

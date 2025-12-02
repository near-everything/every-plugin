import { createPluginRuntime } from "every-plugin/runtime";
import { describe, expect, it } from "vitest";
import type { TestPlugin } from "../fixtures/test-plugin/src/index";
import { TEST_REGISTRY } from "../registry";

class MockClient {
  constructor(public baseUrl: string) {}

  async getData(id: string): Promise<{ id: string; data: string }> {
    return { id, data: `data-from-${this.baseUrl}` };
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}

type TestRegistryWithClient = {
  "test-plugin": typeof TestPlugin;
};

const SECRETS_CONFIG = {
  API_KEY: "test-api-key-value",
};

describe("Variable Serialization Integration Tests", () => {
  it("should preserve object methods when passed as variables through Module Federation", async () => {
    const runtime = createPluginRuntime<TestRegistryWithClient>({
      registry: TEST_REGISTRY,
      secrets: SECRETS_CONFIG
    });

    const mockClient = new MockClient("http://api.example.com");

    expect(mockClient).toBeInstanceOf(MockClient);
    expect(typeof mockClient.getData).toBe('function');
    expect(typeof mockClient.getBaseUrl).toBe('function');

    const { client } = await runtime.usePlugin("test-plugin", {
      variables: {
        baseUrl: "http://localhost:1337",
        timeout: 5000,
        client: mockClient,
      },
      secrets: {
        apiKey: "test-api-key-value",
      },
    });

    const result = await client.useClient({ id: "123" });

    expect(result.hasGetDataMethod).toBe(true);
    expect(result.hasGetBaseUrlMethod).toBe(true);
    expect(result.clientType).toBe('MockClient');
    expect(result.result).toContain('data-from-http://api.example.com');
    expect(result.result).toContain('"id":"123"');
  }, 15000);

  it("should handle nested objects with methods through Module Federation", async () => {
    const runtime = createPluginRuntime<TestRegistryWithClient>({
      registry: TEST_REGISTRY,
      secrets: SECRETS_CONFIG
    });

    const mockClient = new MockClient("http://nested.example.com");

    const { client } = await runtime.usePlugin("test-plugin", {
      variables: {
        baseUrl: "http://localhost:1337",
        timeout: 5000,
        client: mockClient,
      },
      secrets: {
        apiKey: "test-api-key-value",
      },
    });

    const result = await client.useClient({ id: "456" });

    expect(result.hasGetDataMethod).toBe(true);
    expect(result.result).toContain('data-from-http://nested.example.com');
    expect(result.result).toContain('"id":"456"');
  }, 15000);
});

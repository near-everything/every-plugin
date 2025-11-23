import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { oc } from "every-plugin/orpc";
import { createLocalPluginRuntime } from "every-plugin/testing";
import { z } from "every-plugin/zod";
import { describe, expect, it } from "vitest";

// Mock client with methods to test serialization
class MockClient {
  constructor(public baseUrl: string) { }

  async getData(id: string): Promise<{ id: string; data: string }> {
    return { id, data: `data-from-${this.baseUrl}` };
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}

// Consumer plugin that accepts a client as a variable
const ConsumerPlugin = createPlugin({
  variables: z.object({
    client: z.custom<MockClient>((val) => val instanceof MockClient, {
      message: "Must be a MockClient instance"
    }),
    prefix: z.string().default("consumer")
  }),
  secrets: z.object({}),
  contract: oc.router({
    useClient: oc.route({
      method: "POST",
      path: "/use-client",
      summary: "Uses the injected client",
    })
      .input(z.object({ id: z.string() }))
      .output(z.object({
        result: z.string(),
        clientType: z.string(),
        hasGetDataMethod: z.boolean(),
        hasGetBaseUrlMethod: z.boolean()
      }))
  }),
  initialize: (config) =>
    Effect.succeed({
      client: config.variables.client,
      prefix: config.variables.prefix,
      isInstance: config.variables.client instanceof MockClient,
      hasGetData: typeof config.variables.client.getData === 'function',
      hasGetBaseUrl: typeof config.variables.client.getBaseUrl === 'function'
    }),
  createRouter: (context, builder) => ({
    useClient: builder.useClient.handler(async ({ input }) => {
      const { client, prefix, hasGetData, hasGetBaseUrl } = context;

      let result: string;
      try {
        // This will fail if methods were stripped during serialization
        const data = await client.getData(input.id);
        result = `${prefix}: ${data.data}`;
      } catch (error) {
        result = `Error calling client.getData: ${error instanceof Error ? error.message : String(error)}`;
      }

      return {
        result,
        clientType: client.constructor.name,
        hasGetDataMethod: hasGetData,
        hasGetBaseUrlMethod: hasGetBaseUrl
      };
    })
  })
});

declare module "every-plugin" {
  interface RegisteredPlugins {
    "consumer-plugin": typeof ConsumerPlugin;
  }
}

describe("Variable Serialization", () => {
  it("should preserve object methods when passed as variables", async () => {
    const runtime = createLocalPluginRuntime(
      {
        registry: {
          "consumer-plugin": {
            remoteUrl: "http://localhost:3999/remoteEntry.js"
          }
        },
        secrets: {}
      },
      { "consumer-plugin": ConsumerPlugin }
    );

    // Create a client with methods
    const mockClient = new MockClient("http://api.example.com");

    // Verify client has methods before passing
    expect(mockClient).toBeInstanceOf(MockClient);
    expect(typeof mockClient.getData).toBe('function');
    expect(typeof mockClient.getBaseUrl).toBe('function');

    // Pass client as a variable to the consumer plugin
    const plugin = await runtime.usePlugin("consumer-plugin", {
      variables: {
        client: mockClient,
        prefix: "test"
      },
      secrets: {}
    });

    // Call a route that uses the client
    const result = await plugin.client.useClient({ id: "123" });

    // Verify the client still works (methods weren't stripped)
    expect(result.hasGetDataMethod).toBe(true);
    expect(result.hasGetBaseUrlMethod).toBe(true);
    expect(result.clientType).toBe('MockClient');
    expect(result.result).toContain('data-from-http://api.example.com');
  });

  it("should preserve nested objects with methods", async () => {
    const runtime = createLocalPluginRuntime(
      {
        registry: {
          "consumer-plugin": {
            remoteUrl: "http://localhost:3999/remoteEntry.js"
          }
        },
        secrets: {}
      },
      { "consumer-plugin": ConsumerPlugin }
    );

    const mockClient = new MockClient("http://nested.example.com");

    const plugin = await runtime.usePlugin("consumer-plugin", {
      variables: {
        client: mockClient,
        prefix: "nested"
      },
      secrets: {}
    });

    const result = await plugin.client.useClient({ id: "456" });

    expect(result.hasGetDataMethod).toBe(true);
    expect(result.result).toContain('data-from-http://nested.example.com');
  });
});

import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import { describe, expect, it } from "vitest";

// Define a simple test contract
const testContract = oc.router({
  publicRoute: oc
    .route({
      method: 'GET',
      path: '/public',
      summary: 'Public route',
    })
    .output(z.object({ message: z.string() })),

  protectedRoute: oc
    .route({
      method: 'GET',
      path: '/protected',
      summary: 'Protected route',
    })
    .output(z.object({ message: z.string(), userId: z.string() })),
});

describe("Context Schema", () => {
  it("should create plugin with context schema", () => {
    const plugin = createPlugin({
      variables: z.object({
        baseUrl: z.string(),
      }),
      secrets: z.object({
        apiKey: z.string(),
      }),
      context: z.object({
        userId: z.string().optional(),
        sessionId: z.string().optional(),
      }),
      contract: testContract,
      initialize: (config) => Effect.succeed({
        client: { baseUrl: config.variables.baseUrl },
        apiKey: config.secrets.apiKey,
      }),
      createRouter: (deps, builder) => {
        const requireAuth = builder.middleware(async ({ context, next }) => {
          if (!context.userId) {
            throw new Error('UNAUTHORIZED: User ID required');
          }
          return next({ context: { ...context, userId: context.userId } });
        });

        return {
          publicRoute: builder.publicRoute.handler(async ({ input }) => {
            return { message: "public response" };
          }),

          protectedRoute: builder.protectedRoute
            .use(requireAuth)
            .handler(async ({ input, context }) => {
              return {
                message: "protected response",
                userId: context.userId, // Guaranteed non-null due to middleware
              };
            }),
        };
      },
    });

    expect(plugin).toBeDefined();
    expect(plugin.binding).toBeDefined();
    expect(plugin.binding.context).toBeDefined();
    expect(plugin.binding.context).toBeInstanceOf(Object);
  });

  it("should expose context schema in plugin binding", () => {
    const plugin = createPlugin({
      variables: z.object({ baseUrl: z.string() }),
      secrets: z.object({ apiKey: z.string() }),
      context: z.object({
        userId: z.string().optional(),
        sessionId: z.string().optional(),
      }),
      contract: testContract,
      initialize: (config) => Effect.succeed({ initialized: true }),
      createRouter: (deps, builder) => ({
        publicRoute: builder.publicRoute.handler(async () => ({ message: "test" })),
        protectedRoute: builder.protectedRoute.handler(async () => ({ message: "test", userId: "test" })),
      }),
    });

    // Verify the context schema is properly exposed
    expect(plugin.binding.context).toBeDefined();
    expect(typeof plugin.binding.context.parse).toBe("function");

    // Should be able to parse valid context
    const validContext = { userId: "user123", sessionId: "sess456" };
    expect(() => plugin.binding.context.parse(validContext)).not.toThrow();

    // Should reject invalid context
    const invalidContext = { userId: 123, invalidField: "test" };
    expect(() => plugin.binding.context.parse(invalidContext)).toThrow();
  });
});

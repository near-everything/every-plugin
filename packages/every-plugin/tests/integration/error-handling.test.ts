import { ORPCError } from "@orpc/contract";
import { createPluginRuntime } from "every-plugin/runtime";
import { describe, expect, it } from "vitest";
import { PluginRuntimeError } from "../../src/runtime/errors";
import { TEST_REGISTRY } from "../registry";

const SECRETS_CONFIG = {
	API_KEY: "test-api-key-value",
};

describe("Error Handling Integration Tests", () => {
	describe("Initialization Errors", () => {
		it("should handle invalid API key during initialization", async () => {
			const runtime = createPluginRuntime({
				registry: TEST_REGISTRY,
				secrets: SECRETS_CONFIG,
			});

			try {
				await runtime.usePlugin("test-plugin", {
					variables: { baseUrl: "http://localhost:1337" },
					secrets: { apiKey: "invalid-key" },
				});
				expect.fail("Should have thrown PluginRuntimeError");
			} catch (error: any) {
				expect(error).toBeInstanceOf(PluginRuntimeError);
				expect(error.pluginId).toBe("test-plugin");
				expect(error.operation).toBe("initialize-plugin");
				expect(error.retryable).toBe(false);
				expect(error.cause).toBeDefined();
				expect(error.cause.message).toContain("Invalid API key");
			}
		}, 10000);

		it("should handle connection failures during initialization", async () => {
			const runtime = createPluginRuntime({
				registry: TEST_REGISTRY,
				secrets: SECRETS_CONFIG,
			});

			try {
				await runtime.usePlugin("test-plugin", {
					variables: { baseUrl: "http://localhost:1337" },
					secrets: { apiKey: "connection-fail" },
				});
				expect.fail("Should have thrown PluginRuntimeError");
			} catch (error: any) {
				expect(error).toBeInstanceOf(PluginRuntimeError);
				expect(error.pluginId).toBe("test-plugin");
				expect(error.operation).toBe("initialize-plugin");
				expect(error.retryable).toBe(false);
				expect(error.cause).toBeDefined();
				expect(error.cause.message).toContain("Failed to connect");
			}
		}, 10000);

		it("should handle missing required config", async () => {
			const runtime = createPluginRuntime({
				registry: TEST_REGISTRY,
				secrets: SECRETS_CONFIG,
			});

			try {
				await runtime.usePlugin("test-plugin", {
					variables: { baseUrl: "http://localhost:1337" },
					// @ts-expect-error - Testing missing required field
					secrets: {},
				});
				expect.fail("Should have thrown PluginRuntimeError");
			} catch (error: any) {
				expect(error).toBeInstanceOf(PluginRuntimeError);
				expect(error.pluginId).toBe("test-plugin");
				expect(error.operation).toBe("validate-secrets");
				expect(error.retryable).toBe(false);
			}
		}, 10000);

		it("should handle invalid plugin ID", async () => {
			const runtime = createPluginRuntime({
				registry: TEST_REGISTRY,
				secrets: SECRETS_CONFIG,
			});

			try {
				// @ts-expect-error - Testing invalid plugin ID
				await runtime.usePlugin("non-existent-plugin", {
					variables: { baseUrl: "http://localhost:1337" },
					secrets: { apiKey: "test-key" },
				});
				expect.fail("Should have thrown PluginRuntimeError");
			} catch (error: any) {
				expect(error).toBeInstanceOf(PluginRuntimeError);
				expect(error.pluginId).toBe("non-existent-plugin");
				expect(error.operation).toBe("validate-plugin-id");
				expect(error.retryable).toBe(false);
				expect(error.cause.message).toContain("not found in registry");
			}
		}, 10000);
	});

	describe("oRPC Errors", () => {
		it("should propagate UNAUTHORIZED error with data", async () => {
			const runtime = createPluginRuntime({
				registry: TEST_REGISTRY,
				secrets: SECRETS_CONFIG,
			});

			const { createClient } = await runtime.usePlugin("test-plugin", {
				variables: { baseUrl: "http://localhost:1337", timeout: 5000 },
				secrets: { apiKey: "test-api-key-value" },
			});

			const client = createClient();
			try {
				await client.throwError({ errorType: "UNAUTHORIZED" });
				expect.fail("Should have thrown ORPCError");
			} catch (error: any) {
				expect(error).toBeInstanceOf(ORPCError);
				expect(error.code).toBe("UNAUTHORIZED");
				expect(error.status).toBe(401);
				expect(error.data).toBeDefined();
				expect(error.data.apiKeyProvided).toBe(true);
				expect(error.data.authType).toBe("apiKey");
			}
		}, 10000);

		it("should propagate RATE_LIMITED error with retry info", async () => {
			const runtime = createPluginRuntime({
				registry: TEST_REGISTRY,
				secrets: SECRETS_CONFIG,
			});

			const { createClient } = await runtime.usePlugin("test-plugin", {
				variables: { baseUrl: "http://localhost:1337", timeout: 5000 },
				secrets: { apiKey: "test-api-key-value" },
			});

			const client = createClient();
			try {
				await client.throwError({ errorType: "RATE_LIMITED" });
				expect.fail("Should have thrown ORPCError");
			} catch (error: any) {
				expect(error).toBeInstanceOf(ORPCError);
				expect(error.code).toBe("RATE_LIMITED");
				expect(error.status).toBe(429);
				expect(error.data).toBeDefined();
				expect(error.data.retryAfter).toBe(60);
				expect(error.data.remainingRequests).toBe(0);
				expect(error.data.limitType).toBe("requests");
			}
		}, 10000);

		it("should propagate SERVICE_UNAVAILABLE error", async () => {
			const runtime = createPluginRuntime({
				registry: TEST_REGISTRY,
				secrets: SECRETS_CONFIG,
			});

			const { createClient } = await runtime.usePlugin("test-plugin", {
				variables: { baseUrl: "http://localhost:1337", timeout: 5000 },
				secrets: { apiKey: "test-api-key-value" },
			});

			const client = createClient();
			try {
				await client.throwError({ errorType: "SERVICE_UNAVAILABLE" });
				expect.fail("Should have thrown ORPCError");
			} catch (error: any) {
				expect(error).toBeInstanceOf(ORPCError);
				expect(error.code).toBe("SERVICE_UNAVAILABLE");
				expect(error.status).toBe(503);
				expect(error.data).toBeDefined();
				expect(error.data.retryAfter).toBe(30);
				expect(error.data.maintenanceWindow).toBe(false);
			}
		}, 10000);

		it("should propagate FORBIDDEN error with permissions", async () => {
			const runtime = createPluginRuntime({
				registry: TEST_REGISTRY,
				secrets: SECRETS_CONFIG,
			});

			const { createClient } = await runtime.usePlugin("test-plugin", {
				variables: { baseUrl: "http://localhost:1337", timeout: 5000 },
				secrets: { apiKey: "test-api-key-value" },
			});

			const client = createClient();
			try {
				await client.throwError({ errorType: "FORBIDDEN" });
				expect.fail("Should have thrown ORPCError");
			} catch (error: any) {
				expect(error).toBeInstanceOf(ORPCError);
				expect(error.code).toBe("FORBIDDEN");
				expect(error.status).toBe(403);
				expect(error.data).toBeDefined();
				expect(error.data.requiredPermissions).toEqual(["read:data"]);
				expect(error.data.action).toBe("test");
			}
		}, 10000);

		it("should include custom error message when provided", async () => {
			const runtime = createPluginRuntime({
				registry: TEST_REGISTRY,
				secrets: SECRETS_CONFIG,
			});

			const { createClient } = await runtime.usePlugin("test-plugin", {
				variables: { baseUrl: "http://localhost:1337", timeout: 5000 },
				secrets: { apiKey: "test-api-key-value" },
			});

			const client = createClient();
			const customMessage = "Custom error message for testing";

			try {
				await client.throwError({
					errorType: "UNAUTHORIZED",
					customMessage,
				});
				expect.fail("Should have thrown ORPCError");
			} catch (error: any) {
				expect(error).toBeInstanceOf(ORPCError);
				expect(error.code).toBe("UNAUTHORIZED");
				expect(error.message).toBe(customMessage);
			}
		}, 10000);
	});
});

import { ORPCError } from "@orpc/contract";
import { describe, expect, it } from "vitest";
import { PluginRuntimeError, toPluginRuntimeError } from "../../src/runtime/errors";

describe("Error Handling Utilities", () => {
	describe("extractErrorMessage", () => {
		it("should extract message from Error instance", () => {
			const error = new Error("Test error message");
			const result = toPluginRuntimeError(error, "test-plugin");
			
			expect(result).toBeInstanceOf(PluginRuntimeError);
			expect(result.cause?.message).toBe("Test error message");
		});

		it("should extract from nested cause", () => {
			const rootCause = new Error("Root cause");
			const wrapper = new Error("Wrapper error", { cause: rootCause });
			const result = toPluginRuntimeError(wrapper, "test-plugin");
			
			expect(result.cause?.message).toContain("Wrapper error");
		});

		it("should handle AggregateError", () => {
			const errors = [
				new Error("Error 1"),
				new Error("Error 2"),
				new Error("Error 3")
			];
			const aggregateError = new AggregateError(errors, "Multiple errors occurred");
			const result = toPluginRuntimeError(aggregateError, "test-plugin");
			
			expect(result).toBeInstanceOf(PluginRuntimeError);
			expect(result.cause).toBeDefined();
		});

		it("should handle plain objects with message property", () => {
			const plainError = { message: "Plain object error" };
			const result = toPluginRuntimeError(plainError, "test-plugin");
			
			expect(result).toBeInstanceOf(PluginRuntimeError);
			expect(result.cause?.message).toBe("Plain object error");
		});

		it("should stringify unknown types", () => {
			const unknownError = 42;
			const result = toPluginRuntimeError(unknownError, "test-plugin");
			
			expect(result).toBeInstanceOf(PluginRuntimeError);
			expect(result.cause?.message).toBe("42");
		});

		it("should handle null and undefined", () => {
			const nullResult = toPluginRuntimeError(null, "test-plugin");
			expect(nullResult).toBeInstanceOf(PluginRuntimeError);
			
			const undefinedResult = toPluginRuntimeError(undefined, "test-plugin");
			expect(undefinedResult).toBeInstanceOf(PluginRuntimeError);
		});
	});

	describe("isRetryableError", () => {
		it("should detect ETIMEDOUT as retryable", () => {
			const error = new Error("ETIMEDOUT: Connection timed out");
			const result = toPluginRuntimeError(error, "test-plugin", undefined, undefined, false);
			
			expect(result.retryable).toBe(true);
		});

		it("should detect ECONNRESET as retryable", () => {
			const error = new Error("ECONNRESET: Connection reset by peer");
			const result = toPluginRuntimeError(error, "test-plugin", undefined, undefined, false);
			
			expect(result.retryable).toBe(true);
		});

		it("should detect 503 as retryable", () => {
			const error = new Error("Service returned 503 Service Unavailable");
			const result = toPluginRuntimeError(error, "test-plugin", undefined, undefined, false);
			
			expect(result.retryable).toBe(true);
		});

		it("should detect 429 as retryable", () => {
			const error = new Error("429 Too Many Requests");
			const result = toPluginRuntimeError(error, "test-plugin", undefined, undefined, false);
			
			expect(result.retryable).toBe(true);
		});

		it("should detect timeout keyword as retryable", () => {
			const error = new Error("Request timeout exceeded");
			const result = toPluginRuntimeError(error, "test-plugin", undefined, undefined, false);
			
			expect(result.retryable).toBe(true);
		});

		it("should NOT detect 401 as retryable", () => {
			const error = new Error("401 Unauthorized");
			const result = toPluginRuntimeError(error, "test-plugin", undefined, undefined, false);
			
			expect(result.retryable).toBe(false);
		});

		it("should NOT detect ECONNREFUSED as retryable", () => {
			const error = new Error("ECONNREFUSED: Connection refused");
			const result = toPluginRuntimeError(error, "test-plugin", undefined, undefined, false);
			
			expect(result.retryable).toBe(false);
		});

		it("should NOT detect ENOTFOUND as retryable", () => {
			const error = new Error("ENOTFOUND: Host not found");
			const result = toPluginRuntimeError(error, "test-plugin", undefined, undefined, false);
			
			expect(result.retryable).toBe(false);
		});

		it("should respect defaultRetryable parameter when no pattern matches", () => {
			const error = new Error("Generic error");
			const retryableResult = toPluginRuntimeError(error, "test-plugin", undefined, undefined, true);
			expect(retryableResult.retryable).toBe(true);
			
			const nonRetryableResult = toPluginRuntimeError(error, "test-plugin", undefined, undefined, false);
			expect(nonRetryableResult.retryable).toBe(false);
		});
	});

	describe("toPluginRuntimeError", () => {
		it("should wrap ORPCError with correct properties", () => {
			const orpcError = new ORPCError("TOO_MANY_REQUESTS", {
				message: "Rate limit exceeded",
				data: { retryAfter: 60 }
			});

			const result = toPluginRuntimeError(orpcError, "test-plugin", "testProcedure", "test-operation");
			
			expect(result).toBeInstanceOf(PluginRuntimeError);
			expect(result.pluginId).toBe("test-plugin");
			expect(result.procedureName).toBe("testProcedure");
			expect(result.operation).toBe("test-operation");
			expect(result.retryable).toBe(true);
		});

		it("should detect retryable oRPC error codes", () => {
			const retryableCodes = ["TOO_MANY_REQUESTS", "SERVICE_UNAVAILABLE", "BAD_GATEWAY", "GATEWAY_TIMEOUT", "TIMEOUT"];
			
			retryableCodes.forEach(code => {
				const error = new ORPCError(code, { message: "Test" });
				const result = toPluginRuntimeError(error, "test-plugin");
				expect(result.retryable).toBe(true);
			});
		});

		it("should detect non-retryable oRPC error codes", () => {
			const nonRetryableCodes = ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "BAD_REQUEST"];
			
			nonRetryableCodes.forEach(code => {
				const error = new ORPCError(code, { message: "Test" });
				const result = toPluginRuntimeError(error, "test-plugin");
				expect(result.retryable).toBe(false);
			});
		});

		it("should pass through existing PluginRuntimeError", () => {
			const existingError = new PluginRuntimeError({
				pluginId: "original-plugin",
				operation: "original-operation",
				retryable: true,
				cause: new Error("Original cause")
			});

			const result = toPluginRuntimeError(existingError, "new-plugin");
			
			expect(result).toBe(existingError);
			expect(result.pluginId).toBe("original-plugin");
		});

		it("should convert unknown errors with metadata", () => {
			const error = new Error("Unknown error");
			const result = toPluginRuntimeError(error, "test-plugin", "testProc", "test-op", false);
			
			expect(result).toBeInstanceOf(PluginRuntimeError);
			expect(result.pluginId).toBe("test-plugin");
			expect(result.procedureName).toBe("testProc");
			expect(result.operation).toBe("test-op");
			expect(result.retryable).toBe(false);
			expect(result.cause).toBe(error);
		});

		it("should handle errors without Error instances", () => {
			const stringError = "String error message";
			const result = toPluginRuntimeError(stringError, "test-plugin");
			
			expect(result).toBeInstanceOf(PluginRuntimeError);
			expect(result.cause).toBeInstanceOf(Error);
			expect(result.cause?.message).toBe("String error message");
		});
	});

	describe("Error categorization", () => {
		it("should categorize connection errors", () => {
			const connectionErrors = [
				"ECONNREFUSED",
				"ENOTFOUND",
				"EHOSTUNREACH",
			];

			connectionErrors.forEach(pattern => {
				const error = new Error(`Connection failed: ${pattern}`);
				const result = toPluginRuntimeError(error, "test-plugin");
				expect(result.cause?.message).toContain(pattern);
			});
		});

		it("should categorize authentication errors", () => {
			const authErrors = [
				"401 Unauthorized",
				"Authentication failed",
				"Invalid credentials",
			];

			authErrors.forEach(message => {
				const error = new Error(message);
				const result = toPluginRuntimeError(error, "test-plugin");
				expect(result.cause?.message).toContain(message);
			});
		});

		it("should categorize permission errors", () => {
			const permissionErrors = [
				"EACCES",
				"Permission denied",
				"Access forbidden",
			];

			permissionErrors.forEach(message => {
				const error = new Error(message);
				const result = toPluginRuntimeError(error, "test-plugin");
				expect(result.cause?.message).toContain(message);
			});
		});
	});
});

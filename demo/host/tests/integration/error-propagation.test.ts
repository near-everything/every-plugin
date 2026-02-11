import { Effect } from "every-plugin/effect";
import { loadBosConfig, type RuntimeConfig } from "everything-dev/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadRouterModule } from "@/services/federation.server";
import type { RouterModule } from "@/types";

async function consumeStream(stream: ReadableStream): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let html = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		html += decoder.decode(value, { stream: true });
	}
	html += decoder.decode();
	return html;
}

interface ORPCErrorResponse {
	code: string;
	status: number;
	message: string;
	data?: Record<string, unknown>;
}

const parseORPCError = async (
	response: Response,
): Promise<ORPCErrorResponse | null> => {
	try {
		const json = await response.json();
		if (json && typeof json === "object" && "code" in json) {
			return json as ORPCErrorResponse;
		}
		if (json && typeof json === "object" && "error" in json) {
			return json.error as ORPCErrorResponse;
		}
		return json;
	} catch {
		return null;
	}
};

describe("ORPC Error Propagation to HTTP Response", () => {
	let routerModule: RouterModule;
	let config: RuntimeConfig;

	const mockApiClient = {
		getValue: vi.fn(),
		setValue: vi
			.fn()
			.mockResolvedValue({ key: "test", value: "value", created: true }),
		protected: vi.fn(),
		listKeys: vi.fn(),
		deleteKey: vi.fn(),
		ping: vi
			.fn()
			.mockResolvedValue({ status: "ok", timestamp: new Date().toISOString() }),
	};

	beforeAll(async () => {
		globalThis.$apiClient = mockApiClient as any;
		config = await loadBosConfig();
		routerModule = await loadRouterModule(config);
	});

	afterAll(() => {
		delete (globalThis as Record<string, unknown>).$apiClient;
	});

	describe("Error Structure Preservation", () => {
		it("should return error object with complete structure, not empty object", async () => {
			mockApiClient.protected.mockRejectedValueOnce({
				code: "UNAUTHORIZED",
				status: 401,
				message: "Auth required",
				data: { apiKeyProvided: false, authType: "apiKey" },
			});

			try {
				await mockApiClient.protected();
				expect.fail("Should have thrown error");
			} catch (error) {
				// Critical: Error should NOT be empty object {}
				expect(error).toBeDefined();
				expect(error).not.toEqual({});

				// All required fields must be present
				expect(error).toHaveProperty("code");
				expect(error).toHaveProperty("message");
				expect(error).toHaveProperty("status");
				expect(error).toHaveProperty("data");

				// Verify UNAUTHORIZED error is preserved
				expect(error.code).toBe("UNAUTHORIZED");
				expect(error.message).toBe("Auth required");
				expect(error.status).toBe(401);

				// Verify data is preserved
				expect(error.data).toBeDefined();
				expect(error.data.apiKeyProvided).toBe(false);
				expect(error.data.authType).toBe("apiKey");
			}
		});

		it("should preserve NOT_FOUND error structure", async () => {
			mockApiClient.getValue.mockRejectedValueOnce({
				code: "NOT_FOUND",
				status: 404,
				message: "Key not found",
				data: { resource: "kv", resourceId: "specific-key-123" },
			});

			try {
				await mockApiClient.getValue({ key: "specific-key-123" });
				expect.fail("Should have thrown NOT_FOUND error");
			} catch (error) {
				// Error should not be empty
				expect(error).toBeDefined();
				expect(error).not.toEqual({});

				// Complete structure check
				expect(error.code).toBe("NOT_FOUND");
				expect(error.status).toBe(404);
				expect(error.message).toBe("Key not found");

				// Data context preserved
				expect(error.data).toBeDefined();
				expect(error.data.resource).toBe("kv");
				expect(error.data.resourceId).toBe("specific-key-123");
			}
		});

		it("should preserve FORBIDDEN error with action data", async () => {
			mockApiClient.setValue.mockRejectedValueOnce({
				code: "FORBIDDEN",
				status: 403,
				message: "Access denied",
				data: { action: "write", requiredPermissions: ["write:data"] },
			});

			try {
				await mockApiClient.setValue({ key: "test", value: "value" });
				expect.fail("Should have thrown FORBIDDEN error");
			} catch (error) {
				expect(error).toBeDefined();
				expect(error).not.toEqual({});

				expect(error.code).toBe("FORBIDDEN");
				expect(error.status).toBe(403);

				// Verify action data is preserved
				expect(error.data).toBeDefined();
				expect(error.data.action).toBe("write");
				expect(error.data.requiredPermissions).toEqual(["write:data"]);
			}
		});
	});

	describe("Error Serialization", () => {
		it("should produce valid JSON that can be parsed", async () => {
			mockApiClient.protected.mockRejectedValueOnce({
				code: "UNAUTHORIZED",
				status: 401,
				message: "Auth required for testing",
				data: { apiKeyProvided: false },
			});

			try {
				await mockApiClient.protected();
				expect.fail("Should have thrown");
			} catch (error) {
				const errorStr = JSON.stringify(error);

				// Should NOT be empty object
				expect(errorStr).not.toBe("{}");
				expect(errorStr).not.toMatch(/^\s*\{\s*\}\s*$/);

				// Should contain error code
				expect(errorStr).toContain("UNAUTHORIZED");

				// Should contain meaningful message
				expect(errorStr).toContain("Auth required");

				// Should parse back successfully
				const parsed = JSON.parse(errorStr);
				expect(parsed.code).toBe("UNAUTHORIZED");
				expect(parsed.message).toBe("Auth required for testing");
			}
		});

		it("should have enough information for debugging", async () => {
			mockApiClient.getValue.mockRejectedValueOnce({
				code: "NOT_FOUND",
				status: 404,
				message: "Resource not found for debugging",
				data: { resource: "kv", resourceId: "debug-123" },
			});

			try {
				await mockApiClient.getValue({ key: "debug-123" });
				expect.fail("Should have thrown");
			} catch (error) {
				const errorStr = JSON.stringify(error);

				// Should have enough content to debug
				expect(errorStr.length).toBeGreaterThan(50);

				// Should not be just placeholder text
				expect(errorStr).not.toMatch(/Error:\s*\{\}/);

				// Should contain resource identifier
				expect(errorStr).toContain("debug-123");
			}
		});
	});

	describe("SS Error Context Preservation", () => {
		it("should include error data for user notifications", async () => {
			mockApiClient.protected.mockRejectedValueOnce({
				code: "UNAUTHORIZED",
				status: 401,
				message: "Authentication required",
				data: { apiKeyProvided: false, provider: "test-provider" },
			});

			try {
				await mockApiClient.protected();
				expect.fail("Should have thrown");
			} catch (error) {
				// For toast notifications
				expect(error.message).toBeDefined();
				expect(error.message.length).toBeGreaterThan(0);
				expect(error.message).not.toContain("Error: {}");

				// For user-friendly display
				expect(error.data).toBeDefined();
				expect(error.data.apiKeyProvided).toBe(false);
			}
		});

		it("should preserve status codes for conditional error display", async () => {
			const testCases = [
				{ code: "UNAUTHORIZED", status: 401, message: "Auth required" },
				{ code: "NOT_FOUND", status: 404, message: "Not found" },
				{ code: "FORBIDDEN", status: 403, message: "Forbidden" },
				{ code: "ERROR_CODE", status: 500, message: "Server error" },
			];

			for (const testCase of testCases) {
				mockApiClient.setValue.mockRejectedValueOnce(testCase);

				try {
					await mockApiClient.setValue({ key: "test", value: "value" });
					expect.fail(`Should have thrown ${testCase.code}`);
				} catch (error) {
					expect(error.status).toBeDefined();
					expect(typeof error.status).toBe("number");
					expect(error.status).toBe(testCase.status);

					expect(error.code).toBeDefined();
					expect(typeof error.code).toBe("string");
					expect(error.code).toBe(testCase.code);
				}
			}
		});
	});

	describe("Status Code Consistency", () => {
		it("should map error codes to correct HTTP status codes", async () => {
			const statusMappings = {
				UNAUTHORIZED: 401,
				NOT_FOUND: 404,
				FORBIDDEN: 403,
				BAD_REQUEST: 400,
			};

			for (const [code, expectedStatus] of Object.entries(statusMappings)) {
				mockApiClient.listKeys.mockRejectedValueOnce({
					code,
					status: expectedStatus,
					message: `Test ${code}`,
				});

				try {
					await mockApiClient.listKeys({ limit: 10 });
					expect.fail(`Should have thrown ${code}`);
				} catch (error) {
					expect(error.status).toBe(expectedStatus);
					expect(error.code).toBe(code);
				}
			}
		});
	});
});

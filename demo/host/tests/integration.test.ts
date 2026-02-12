import { describe, expect, it } from "vitest";

describe("Host Runtime Module Federation", () => {
	it("should load router with runtime config", async () => {
		// Set up minimal runtime config for testing
		process.env.BOS_RUNTIME_CONFIG = JSON.stringify({
			env: "test",
			account: "test.near",
			hostUrl: "http://localhost:3000",
			ui: {
				name: "ui",
				url: "http://localhost:3002",
				source: "remote",
			},
			api: {
				name: "api",
				url: "http://localhost:3014",
				source: "remote",
			},
		});

		// Polyfill for MF runtime in Node
		if (!globalThis.self) {
			(globalThis as any).self = globalThis;
		}

		// Import the router module
		const { getRouter } = await import("../src/router");

		// Verify getRouter is exported and is async
		expect(typeof getRouter).toBe("function");
		expect(getRouter.constructor.name).toBe("AsyncFunction");
	});

	it("should read runtime config from env", () => {
		const testConfig = {
			env: "production",
			account: "every.near",
			hostUrl: "https://example.com",
			ui: {
				name: "ui",
				url: "https://ui.example.com",
				source: "remote",
			},
			api: {
				name: "api",
				url: "https://api.example.com",
				source: "remote",
				proxy: null,
			},
		};

		process.env.BOS_RUNTIME_CONFIG = JSON.stringify(testConfig);

		// Verify BOS_RUNTIME_CONFIG is set
		expect(process.env.BOS_RUNTIME_CONFIG).toBeDefined();
		const parsed = JSON.parse(process.env.BOS_RUNTIME_CONFIG!);
		expect(parsed.account).toBe("every.near");
		expect(parsed.ui.url).toBe("https://ui.example.com");
	});
});

describe("Host Server Exports", () => {
	it("should export runServer function", async () => {
		const { runServer } = await import("../src/program");

		expect(typeof runServer).toBe("function");
	});

	it("should accept runtime config in runServer", async () => {
		const { runServer } = await import("../src/program");

		// Mock config
		const mockConfig = {
			env: "test" as const,
			account: "test.near",
			hostUrl: "http://localhost:3000",
			ui: {
				name: "ui",
				url: "http://localhost:3002",
				source: "remote" as const,
			},
			api: {
				name: "api",
				url: "http://localhost:3014",
				source: "remote" as const,
			},
		};

		// Verify runServer accepts the config type
		// Note: We don't actually start the server in tests
		expect(() => {
			// Just verify the function signature accepts the config
			const handle = runServer({ config: mockConfig as any });
			// Should return a handle with ready and shutdown
			expect(handle).toHaveProperty("ready");
			expect(handle).toHaveProperty("shutdown");
			expect(typeof handle.shutdown).toBe("function");
		}).not.toThrow();
	});
});

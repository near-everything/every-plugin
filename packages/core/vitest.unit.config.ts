import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["__tests__/unit/**/*.test.ts", "__tests__/unit/**/*.spec.ts"],
		exclude: [
			"node_modules/**",
			"dist/**",
			"test-plugin/node_modules/**",
			"test-plugin/dist/**",
			"**/node_modules/**",
			"**/*.d.ts"
		],
		testTimeout: 30000,
		// No globalSetup for unit tests - they use mocks
	},
	resolve: {
		alias: {
			"@": "./src",
			// Alias the real MF service to use the mock for unit tests
			"../../src/runtime/services/module-federation.service": "./__tests__/mocks/module-federation.service.ts",
		},
	},
});

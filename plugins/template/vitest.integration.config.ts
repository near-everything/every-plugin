import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/__tests__/integration/**/*.test.ts"],
		exclude: [
			"node_modules/**",
			"dist/**",
			"**/node_modules/**",
			"**/*.d.ts",
			"src/__tests__/unit/**",
		],
		setupFiles: ["./src/__tests__/setup.ts"],
		globalSetup: ["./src/__tests__/integration/global-setup.ts"],
		testTimeout: 45000, // Longer timeout for integration tests with user interaction
		// Run sequentially to avoid port conflicts
		pool: "threads",
		poolOptions: {
			threads: {
				singleThread: true
			}
		}
	},
	resolve: {
		alias: {
			"@": "./src",
		},
	},
});

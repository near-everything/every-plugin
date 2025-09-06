import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["__tests__/integration/**/*.test.ts", "__tests__/integration/**/*.spec.ts"],
		exclude: [
			"node_modules/**",
			"dist/**",
			"test-plugin/node_modules/**",
			"test-plugin/dist/**",
			"**/node_modules/**",
			"**/*.d.ts"
		],
		globalSetup: ["./__tests__/integration/global-setup.ts"],
		testTimeout: 30000,
	},
	resolve: {
		alias: {
			"@": "./src",
		},
	},
});

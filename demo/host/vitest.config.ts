import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		testTimeout: 30000,
		include: ["tests/**/*.test.ts"],
		// No global setup - tests run in isolation with mocked configs
		setupFiles: [],
	},
	plugins: [
		tsconfigPaths({
			projects: ["./tsconfig.json"],
		}),
	],
});

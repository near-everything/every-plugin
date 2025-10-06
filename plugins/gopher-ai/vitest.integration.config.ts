import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/integration/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    setupFiles: ["./src/__tests__/setup.ts"],
    testTimeout: 30000,
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

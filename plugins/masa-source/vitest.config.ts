import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/types/index.ts",
        "src/**/index.ts",
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
      ],
    },
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});

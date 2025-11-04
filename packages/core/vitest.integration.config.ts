import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    globalSetup: ["./tests/setup/global-setup.ts"],
    testTimeout: 30000,
  },
  plugins: [
    tsconfigPaths({
      projects: ['./tsconfig.json'],
    }),
  ],
});

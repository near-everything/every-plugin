import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 90000,
    hookTimeout: 90000,
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    sequence: {
      shuffle: false,
    },
    reporters: ["verbose"],
  },
});

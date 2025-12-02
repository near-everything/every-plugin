import Plugin from "@/index";
import pluginDevConfig, { testRoutes, testNotionals } from "../plugin.dev";
import { createLocalPluginRuntime } from "every-plugin/testing";

const TEST_PLUGIN_ID = pluginDevConfig.pluginId;
const TEST_CONFIG = pluginDevConfig.config;

const TEST_REGISTRY = {
  [TEST_PLUGIN_ID]: {
    remoteUrl: "http://localhost:3000/remoteEntry.js",
    version: "1.0.0",
    description: "Integration test runtime",
  },
};

const TEST_PLUGIN_MAP = { [TEST_PLUGIN_ID]: Plugin } as const;

// Create shared runtime (initialized once)
export const runtime = createLocalPluginRuntime<typeof TEST_PLUGIN_MAP>(
  { registry: TEST_REGISTRY, secrets: {} },
  TEST_PLUGIN_MAP
);

// Helper to get client (reuses same plugin instance)
export async function getPluginClient() {
  const { client } = await runtime.usePlugin(TEST_PLUGIN_ID, TEST_CONFIG);
  return client;
}

// Re-export test data
export { testRoutes, testNotionals };

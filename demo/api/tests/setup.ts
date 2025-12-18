import Plugin from '@/index';
import pluginDevConfig from '../plugin.dev';
import { createPluginRuntime } from 'every-plugin';

const TEST_PLUGIN_ID = pluginDevConfig.pluginId;
const TEST_CONFIG = pluginDevConfig.config;

const TEST_REGISTRY = {
  [TEST_PLUGIN_ID]: {
    module: Plugin,
    description: 'Integration test runtime',
  },
} as const;

export const runtime = createPluginRuntime({
  registry: TEST_REGISTRY,
  secrets: {},
});

export async function getPluginClient() {
  const { createClient } = await runtime.usePlugin(TEST_PLUGIN_ID, TEST_CONFIG);
  return createClient();
}

export async function teardown() {
  await runtime.shutdown();
}

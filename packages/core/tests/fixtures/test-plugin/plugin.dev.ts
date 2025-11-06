import type { PluginConfigInput } from 'every-plugin';
import type { TestPlugin } from './src/index';

export default {
  port: 3999,
  config: {
    variables: {
      baseUrl: "https://api.test.com",
      timeout: 5000,
      backgroundEnabled: true
    },
    secrets: {
      apiKey: process.env.TEST_PLUGIN_API_KEY || "dev-key-12345"
    }
  } satisfies PluginConfigInput<typeof TestPlugin>
}

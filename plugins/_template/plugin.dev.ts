import type { PluginConfigInput } from 'every-plugin';
import type Plugin from './src/index';

export default {
  port: 3014,
  config: {
    variables: {
      baseUrl: "https://api.example.com",
      timeout: 10000
    },
    secrets: {
      apiKey: process.env.TEMPLATE_PLUGIN_API_KEY || "dev-key-12345"
    }
  } satisfies PluginConfigInput<typeof Plugin>
}

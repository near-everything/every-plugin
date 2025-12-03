import type { PluginConfigInput } from 'every-plugin';
import type Plugin from './src/index';
import packageJson from './package.json' with { type: 'json' };

export default {
  pluginId: packageJson.name,
  port: 3014,
  prefix: '/template',
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

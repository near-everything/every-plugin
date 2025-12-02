import type { PluginConfigInput } from 'every-plugin';
import type Plugin from './src/index';
import packageJson from './package.json' with { type: 'json' };
import "dotenv/config";

export default {
  pluginId: packageJson.name, // DO NOT CHANGE
  port: 3022,
  config: {
    // NEAR Intents data provider configuration
    variables: {
      network: process.env.NEAR_NETWORK || "testnet",
    },
    secrets: {
      relayerAccountId: process.env.RELAYER_ACCOUNT_ID || 'efiz.testnet',
      relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY!,
    }
  } satisfies PluginConfigInput<typeof Plugin>
}

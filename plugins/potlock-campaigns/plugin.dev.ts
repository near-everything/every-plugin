import 'dotenv/config';
import type { PluginConfigInput } from 'every-plugin';
import type Plugin from './src/index';
import packageJson from './package.json' with { type: 'json' };

export default {
  pluginId: packageJson.name, // DO NOT CHANGE
  port: 3014,
  config: {
    variables: {
      FASTNEAR_RPC_URL: process.env.FASTNEAR_RPC_URL!,
      CAMPAIGN_CONTRACT_ID: process.env.CAMPAIGN_CONTRACT_ID!,
      SYNC_ON_STARTUP: true,
    },
    secrets: {
      DATABASE_URL: process.env.DATABASE_URL || "file:./campaigns.db",
      DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN ?? undefined,

      NEAR_NETWORK: process.env.NEAR_NETWORK || "testnet",
      NEAR_PRIVATE_KEY: process.env.NEAR_PRIVATE_KEY || "",
      NEAR_SIGNER_ID: process.env.NEAR_SIGNER_ID || "",
    }
  } satisfies PluginConfigInput<typeof Plugin>
}

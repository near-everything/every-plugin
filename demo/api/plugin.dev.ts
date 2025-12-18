import type { PluginConfigInput } from "every-plugin";
import type Plugin from "./src/index";
import packageJson from "./package.json" with { type: "json" };
import "dotenv/config";

export default {
  pluginId: packageJson.name,
  port: 3014,
  config: {
    variables: {
      network: "mainnet",
      contractId: "social.near",
    },
    secrets: {
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      GELATO_API_KEY: process.env.GELATO_API_KEY,
      GELATO_WEBHOOK_SECRET: process.env.GELATO_WEBHOOK_SECRET,
      PRINTFUL_API_KEY: process.env.PRINTFUL_API_KEY,
      PRINTFUL_STORE_ID: process.env.PRINTFUL_STORE_ID,
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN,
    },
  } satisfies PluginConfigInput<typeof Plugin>,
};

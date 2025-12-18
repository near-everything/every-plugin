import "dotenv/config";
import type { PluginConfigInput } from "every-plugin";
import packageJson from "./package.json" with { type: "json" };
import type Plugin from "./src/index";

export default {
  pluginId: packageJson.name,
  port: 3014,
  config: {
    variables: {
    },
    secrets: {
      API_DATABASE_URL: process.env.API_DATABASE_URL || "file:./database.db",
      API_DATABASE_AUTH_TOKEN: process.env.API_DATABASE_AUTH_TOKEN,
    },
  } satisfies PluginConfigInput<typeof Plugin>,
};

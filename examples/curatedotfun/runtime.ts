import type GopherAIPlugin from "@curatedotfun/gopher-ai";
import { createPluginRuntime } from "every-plugin/runtime";

// Module augmentation for type safety
declare module "every-plugin" {
  interface RegisteredPlugins {
    "@curatedotfun/gopher-ai": typeof GopherAIPlugin;
  }
}

// Create and export runtime
export const runtime = createPluginRuntime({
  registry: {
    "@curatedotfun/gopher-ai": {
      remoteUrl: "https://elliot-braem-159-curatedotfun-gopher-ai-every-plu-bf7adf22c-ze.zephyrcloud.app/remoteEntry.js",
    }
  },
  secrets: {
    GOPHERAI_API_KEY: Bun.env.GOPHERAI_API_KEY || "your-masa-api-key-here"
  }
});

// Initialize and export plugin
const gopherAi = await runtime.usePlugin(
  "@curatedotfun/gopher-ai",
  {
    secrets: { apiKey: "{{GOPHERAI_API_KEY}}" },
    variables: { baseUrl: "https://data.gopher-ai.com/api/v1", timeout: 30000 }
  }
);

export const plugins = {
  gopherAi
};

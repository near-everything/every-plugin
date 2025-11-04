import type TelegramPlugin from "@curatedotfun/telegram";
import { createPluginRuntime } from "every-plugin/runtime";

// Module augmentation for type safety
declare module "every-plugin" {
  interface RegisteredPlugins {
    "@curatedotfun/telegram": typeof TelegramPlugin;
  }
}

// Create and export runtime
export const runtime = createPluginRuntime({
  registry: {
    "@curatedotfun/telegram": {
      remoteUrl: "https://elliot-braem-158-curatedotfun-telegram-every-plug-567f0e4e6-ze.zephyrcloud.app/remoteEntry.js",
    }
  },
  secrets: {
    TELEGRAM_BOT_TOKEN: Bun.env.TELEGRAM_BOT_TOKEN || "your-bot-token-here",
    TELEGRAM_WEBHOOK_TOKEN: Bun.env.WEBHOOK_TOKEN || ""
  }
});

// Initialize and export plugin
const telegram = await runtime.usePlugin(
  "@curatedotfun/telegram",
  {
    variables: { timeout: 30000 },
    secrets: {
      botToken: "{{TELEGRAM_BOT_TOKEN}}",
      webhookToken: "{{TELEGRAM_WEBHOOK_TOKEN}}"
    }
  }
);


export const plugins = {
  telegram
};

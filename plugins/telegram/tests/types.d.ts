import type { TelegramPlugin } from "@/index";

declare module "every-plugin" {
  interface RegisteredPlugins {
    "@curatedotfun/telegram": typeof TelegramPlugin;
  }
}
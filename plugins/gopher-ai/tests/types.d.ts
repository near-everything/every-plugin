import type { GopherAIPlugin } from "@/index";

declare module "every-plugin" {
  interface RegisteredPlugins {
    "@curatedotfun/gopher-ai": typeof GopherAIPlugin;
  }
}
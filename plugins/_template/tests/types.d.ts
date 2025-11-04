import type { TemplatePlugin } from "@/index";

declare module "every-plugin" {
  interface RegisteredPlugins {
    "@every-plugin/template": typeof TemplatePlugin;
  }
}
import type Plugin from "@/index";

declare module "every-plugin" {
  interface RegisteredPlugins {
    "@every-plugin/template": typeof Plugin;
  }
}
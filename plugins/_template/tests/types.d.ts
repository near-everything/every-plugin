import type TemplateService from "@/index";

declare module "every-plugin" {
  interface RegisteredPlugins {
    "@every-plugin/template": typeof TemplateService;
  }
}
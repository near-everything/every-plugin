import type { TestPlugin } from "./fixtures/test-plugin/src/index";

declare module "every-plugin" {
  interface RegisteredPlugins {
    "test-plugin": typeof TestPlugin;
  }
}

export {};
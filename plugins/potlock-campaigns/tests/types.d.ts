import pluginDevConfig from "../plugin.dev";
import Plugin from "@/index";

declare module "every-plugin" {
  interface RegisteredPlugins {
    [pluginDevConfig.pluginId]: typeof Plugin;
  }
}

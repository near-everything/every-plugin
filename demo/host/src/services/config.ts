import { Context } from "every-plugin/effect";
import type { RuntimeConfig, SharedConfig, SourceMode } from "everything-dev/types";

export type { RuntimeConfig, SharedConfig, SourceMode };

export type ClientRuntimeConfig = Pick<RuntimeConfig, "env" | "title"> & {
  hostUrl?: string;
  assetsUrl: string;
  apiBase: string;
  rpcBase: string;
};

export type WindowRuntimeConfig = Pick<RuntimeConfig, "env" | "title" | "hostUrl"> & {
  ui: Pick<RuntimeConfig["ui"], "name" | "url" | "exposes">;
  apiBase: string;
  rpcBase: string;
};

export class ConfigService extends Context.Tag("host/ConfigService")<
  ConfigService,
  RuntimeConfig
>() {}

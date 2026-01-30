import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Effect } from "every-plugin/effect";
import type { BosConfig, RemoteConfig, SourceMode } from "everything-dev";
import { ConfigError } from "./errors";

export type { BosConfig, SourceMode };

export interface SharedConfig {
  requiredVersion?: string;
  singleton?: boolean;
  eager?: boolean;
  strictVersion?: boolean;
  shareScope?: string;
}

export interface BootstrapConfig {
  config?: BosConfig;
  secrets?: Record<string, string>;
  host?: { url?: string };
  ui?: { source?: SourceMode };
  api?: { source?: SourceMode; proxy?: string };
  database?: { url?: string };
}

let globalBootstrap: BootstrapConfig | undefined;

export function setBootstrapConfig(config: BootstrapConfig): void {
  globalBootstrap = config;
}

export interface RuntimeConfig {
  env: "development" | "production";
  account: string;
  title: string;
  hostUrl: string;
  shared?: {
    ui?: Record<string, SharedConfig>;
  };
  ui: {
    name: string;
    url: string;
    ssrUrl?: string;
    source: SourceMode;
    exposes: Record<string, string>;
  };
  api: {
    name: string;
    url: string;
    source: SourceMode;
    proxy?: string;
    variables?: Record<string, string>;
    secrets?: string[];
  };
}

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

function resolveSource(
  bootstrapSource: SourceMode | undefined,
  envVar: string | undefined,
  env: string
): SourceMode {
  if (bootstrapSource) return bootstrapSource;
  if (envVar === "local" || envVar === "remote") return envVar;
  return env === "production" ? "remote" : "local";
}

function detectHostUrl(bootstrapUrl?: string, port?: number): string {
  if (bootstrapUrl) return bootstrapUrl;
  
  if (process.env.HOST_URL) return process.env.HOST_URL;
  
  const effectivePort = (port ?? Number(process.env.PORT)) || 3000;
  return `http://localhost:${effectivePort}`;
}

function loadConfigFromGateway(
  gatewayConfig: BosConfig,
  gatewaySecrets: Record<string, string> | undefined,
  env: "development" | "production"
): RuntimeConfig {
  if (gatewaySecrets) {
    for (const [key, value] of Object.entries(gatewaySecrets)) {
      process.env[key] = value;
    }
  }

  const uiConfig = gatewayConfig.app.ui as RemoteConfig;
  const apiConfig = gatewayConfig.app.api as RemoteConfig;

  return {
    env,
    account: gatewayConfig.account,
    title: gatewayConfig.app.host.title,
    hostUrl: detectHostUrl(),
    shared: (gatewayConfig as any).shared,
    ui: {
      name: uiConfig.name,
      url: uiConfig.production,
      ssrUrl: uiConfig.ssr || undefined,
      source: "remote",
      exposes: uiConfig.exposes || {},
    },
    api: {
      name: apiConfig.name,
      url: apiConfig.production,
      source: "remote",
      proxy: undefined,
      variables: apiConfig.variables,
      secrets: apiConfig.secrets,
    },
  };
}

export const loadConfig: Effect.Effect<RuntimeConfig, ConfigError> = Effect.gen(function* () {
  const bootstrap = globalBootstrap;
  const env = (process.env.NODE_ENV as "development" | "production") || "development";

  if (bootstrap?.config) {
    return loadConfigFromGateway(bootstrap.config, bootstrap.secrets, env);
  }

  const path = process.env.BOS_CONFIG_PATH ?? resolve(process.cwd(), "bos.config.json");

  if (bootstrap?.secrets) {
    for (const [key, value] of Object.entries(bootstrap.secrets)) {
      process.env[key] = value;
    }
  }

  const raw = yield* Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: (e) => new ConfigError({ path, cause: e }),
  });

  const config = yield* Effect.try({
    try: () => JSON.parse(raw) as BosConfig,
    catch: (e) => new ConfigError({ path, cause: e }),
  });

  const uiConfig = config.app.ui as RemoteConfig;
  const apiConfig = config.app.api as RemoteConfig;

  const uiSource = resolveSource(bootstrap?.ui?.source, process.env.UI_SOURCE, env);
  const apiSource = resolveSource(bootstrap?.api?.source, process.env.API_SOURCE, env);

  const apiProxyEnv = bootstrap?.api?.proxy ?? process.env.API_PROXY;
  const apiProxy = apiProxyEnv === "true" 
    ? apiConfig.proxy || apiConfig.production 
    : apiProxyEnv || undefined;

  const uiUrl = uiSource === "remote" ? uiConfig.production : uiConfig.development;
  const apiUrl = apiSource === "remote" ? apiConfig.production : apiConfig.development;
  const ssrUrl = uiSource === "remote" ? uiConfig.ssr : undefined;

  return {
    env,
    account: config.account,
    title: config.app.host.title,
    hostUrl: detectHostUrl(bootstrap?.host?.url),
    shared: (config as any).shared,
    ui: {
      name: uiConfig.name,
      url: uiUrl,
      ssrUrl,
      source: uiSource,
      exposes: uiConfig.exposes || {},
    },
    api: {
      name: apiConfig.name,
      url: apiUrl,
      source: apiSource,
      proxy: apiProxy,
      variables: apiConfig.variables,
      secrets: apiConfig.secrets,
    },
  } satisfies RuntimeConfig;
});

export class ConfigService extends Effect.Service<ConfigService>()("host/ConfigService", {
  effect: loadConfig,
}) { }

export const loadBosConfig = (): Promise<RuntimeConfig> => Effect.runPromise(loadConfig);

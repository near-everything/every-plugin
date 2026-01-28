import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Effect } from "every-plugin/effect";
import { ConfigError } from "./errors";

export interface BootstrapConfig {
  configPath?: string;
  secrets?: Record<string, string>;
  host?: { url?: string };
  ui?: { source?: SourceMode };
  api?: { source?: SourceMode; proxy?: string };
  database?: { url?: string };
  gatewayConfig?: BosConfig;
  gatewaySecrets?: Record<string, string>;
}

let globalBootstrap: BootstrapConfig | undefined;

export function setBootstrapConfig(config: BootstrapConfig): void {
  globalBootstrap = config;
}

export interface BosConfig {
  account: string;
  gateway?: string;
  app: {
    host: {
      title: string;
      description?: string;
      development: string;
      production: string;
      secrets?: string[];
    };
    ui: {
      name: string;
      development: string;
      production: string;
      ssr?: string;
      exposes: Record<string, string>;
    };
    api: {
      name: string;
      development: string;
      production: string;
      variables?: Record<string, unknown>;
      secrets?: string[];
    };
  };
}

export type SourceMode = "local" | "remote";

export interface RuntimeConfig {
  env: "development" | "production";
  account: string;
  title: string;
  hostUrl: string;
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
    variables?: Record<string, unknown>;
    secrets?: string[];
  };
}

export type ClientRuntimeConfig = Pick<RuntimeConfig, "env" | "title" | "hostUrl"> & {
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

function detectHostUrl(env: "development" | "production", bootstrapUrl?: string, port?: number): string {
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

  return {
    env,
    account: gatewayConfig.account,
    title: gatewayConfig.app.host.title,
    hostUrl: detectHostUrl(env),
    ui: {
      name: gatewayConfig.app.ui.name,
      url: gatewayConfig.app.ui.production,
      ssrUrl: gatewayConfig.app.ui.ssr || undefined,
      source: "remote",
      exposes: gatewayConfig.app.ui.exposes,
    },
    api: {
      name: gatewayConfig.app.api.name,
      url: gatewayConfig.app.api.production,
      source: "remote",
      proxy: undefined,
      variables: gatewayConfig.app.api.variables,
      secrets: gatewayConfig.app.api.secrets,
    },
  };
}

export const loadConfig = Effect.gen(function* () {
  const bootstrap = globalBootstrap;
  const env = (process.env.NODE_ENV as "development" | "production") || "development";

  if (bootstrap?.gatewayConfig) {
    return loadConfigFromGateway(bootstrap.gatewayConfig, bootstrap.gatewaySecrets, env);
  }

  const path = bootstrap?.configPath ?? process.env.BOS_CONFIG_PATH ?? resolve(process.cwd(), "bos.config.json");

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

  const uiSource = resolveSource(bootstrap?.ui?.source, process.env.UI_SOURCE, env);
  const apiSource = resolveSource(bootstrap?.api?.source, process.env.API_SOURCE, env);

  const apiProxyEnv = bootstrap?.api?.proxy ?? process.env.API_PROXY;
  const apiConfig = config.app.api as { proxy?: string };
  const apiProxy = apiProxyEnv === "true" 
    ? apiConfig.proxy || config.app.api.production 
    : apiProxyEnv || undefined;

  const uiUrl = uiSource === "remote" ? config.app.ui.production : config.app.ui.development;
  const apiUrl = apiSource === "remote" ? config.app.api.production : config.app.api.development;
  const ssrUrl = uiSource === "remote" ? config.app.ui.ssr : undefined;

  return {
    env,
    account: config.account,
    title: config.app.host.title,
    hostUrl: detectHostUrl(env, bootstrap?.host?.url),
    ui: {
      name: config.app.ui.name,
      url: uiUrl,
      ssrUrl,
      source: uiSource,
      exposes: config.app.ui.exposes,
    },
    api: {
      name: config.app.api.name,
      url: apiUrl,
      source: apiSource,
      proxy: apiProxy,
      variables: config.app.api.variables,
      secrets: config.app.api.secrets,
    },
  } satisfies RuntimeConfig;
});

export class ConfigService extends Effect.Service<ConfigService>()("host/ConfigService", {
  effect: loadConfig,
}) { }

export const loadBosConfig = (): Promise<RuntimeConfig> => Effect.runPromise(loadConfig);

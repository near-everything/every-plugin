import { dirname, join } from "path";
import type {
  AppConfig,
  BosConfig,
  GatewayConfig,
  HostConfig,
  PortConfig,
  RemoteConfig,
  SourceMode,
} from "./types";

export type { AppConfig, BosConfig, GatewayConfig, HostConfig, PortConfig, RemoteConfig, SourceMode };

export const DEFAULT_DEV_CONFIG: AppConfig = {
  host: "local",
  ui: "local",
  api: "local",
};

let cachedConfig: BosConfig | null = null;
let configDir: string | null = null;
let configLoaded = false;

export function findConfigPath(startDir: string): string | null {
  let dir = startDir;
  while (dir !== "/") {
    const configPath = join(dir, "bos.config.json");
    if (Bun.file(configPath).size > 0) {
      try {
        Bun.file(configPath).text();
        return configPath;
      } catch {
        // File doesn't exist or can't be read
      }
    }
    dir = dirname(dir);
  }
  return null;
}

function findConfigPathSync(startDir: string): string | null {
  let dir = startDir;
  while (dir !== "/") {
    const configPath = join(dir, "bos.config.json");
    const file = Bun.file(configPath);
    if (file.size > 0) {
      return configPath;
    }
    dir = dirname(dir);
  }
  return null;
}

export function loadConfig(cwd?: string): BosConfig | null {
  if (configLoaded) return cachedConfig;

  const startDir = cwd ?? process.cwd();
  const configPath = findConfigPathSync(startDir);

  if (!configPath) {
    configLoaded = true;
    configDir = startDir;
    return null;
  }

  configDir = dirname(configPath);
  const content = require(configPath);
  cachedConfig = content as BosConfig;
  configLoaded = true;
  return cachedConfig;
}

export function setConfig(config: BosConfig, dir?: string): void {
  cachedConfig = config;
  configDir = dir ?? process.cwd();
  configLoaded = true;
}

export function getConfigDir(): string {
  if (!configLoaded) {
    loadConfig();
  }
  return configDir!;
}

export function getRemotes(): string[] {
  const config = loadConfig();
  if (!config) return [];
  return Object.keys(config.app).filter((k) => k !== "host");
}

export function getPackages(): string[] {
  const config = loadConfig();
  if (!config) return [];
  return Object.keys(config.app);
}

export function getRemote(name: string): RemoteConfig | undefined {
  const config = loadConfig();
  if (!config) return undefined;
  const remote = config.app[name];
  if (remote && "name" in remote) {
    return remote as RemoteConfig;
  }
  return undefined;
}

export function getHost(): HostConfig {
  const config = loadConfig();
  if (!config) {
    throw new Error("No bos.config.json found");
  }
  return config.app.host;
}

export function getUrl(
  packageName: string,
  env: "development" | "production" = "development"
): string | undefined {
  const config = loadConfig();
  if (!config) return undefined;
  const pkg = config.app[packageName];
  if (!pkg) return undefined;
  return pkg[env];
}

export function getAccount(): string {
  const config = loadConfig();
  if (!config) {
    throw new Error("No bos.config.json found");
  }
  return config.account;
}

export function getTitle(): string {
  const config = loadConfig();
  if (!config) {
    throw new Error("No bos.config.json found");
  }
  return config.app.host.title;
}

export function getComponentUrl(
  component: "host" | "ui" | "api",
  source: SourceMode
): string {
  const config = loadConfig();
  if (!config) {
    throw new Error("No bos.config.json found");
  }

  if (component === "host") {
    return source === "remote" ? config.app.host.production : config.app.host.development;
  }

  const componentConfig = config.app[component];
  if (!componentConfig || !("name" in componentConfig)) {
    throw new Error(`Component ${component} not found in bos.config.json`);
  }

  return source === "remote" ? componentConfig.production : componentConfig.development;
}

export function parsePort(url: string): number {
  try {
    const parsed = new URL(url);
    return parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === "https:" ? 443 : 80);
  } catch {
    return 3000;
  }
}

export function getPortsFromConfig(): PortConfig {
  const config = loadConfig();
  if (!config) {
    return { host: 3000, ui: 3002, api: 3014 };
  }
  return {
    host: parsePort(config.app.host.development),
    ui: config.app.ui ? parsePort((config.app.ui as RemoteConfig).development) : 3002,
    api: config.app.api ? parsePort((config.app.api as RemoteConfig).development) : 3014,
  };
}

export function getConfigPath(): string {
  if (!configDir) {
    loadConfig();
  }
  return `${configDir}/bos.config.json`;
}

export function getHostRemoteUrl(): string | undefined {
  const config = loadConfig();
  if (!config) return undefined;
  return config.app.host.production || undefined;
}

export function getGatewayUrl(env: "development" | "production" = "development"): string {
  const config = loadConfig();
  if (!config) {
    throw new Error("No bos.config.json found");
  }
  return config.gateway[env];
}

import { dirname, join } from "path";

export type SourceMode = "local" | "remote";

export interface AppConfig {
  host: SourceMode;
  ui: SourceMode;
  api: SourceMode;
  proxy?: boolean;
}

export const DEFAULT_DEV_CONFIG: AppConfig = {
  host: "local",
  ui: "local",
  api: "local",
};

export interface HostConfig {
  title: string;
  description?: string;
  development: string;
  production: string;
  remote?: string;
  secrets?: string[];
}

export interface RemoteConfig {
  name: string;
  development: string;
  production: string;
  ssr?: string;
  exposes?: Record<string, string>;
  variables?: Record<string, string>;
  secrets?: string[];
}

export interface BosConfig {
  account: string;
  templates?: Record<string, string>;
  create?: Record<string, string>;
  cli?: {
    remote?: string;
    local?: string;
  };
  app: {
    host: HostConfig;
    [remoteName: string]: HostConfig | RemoteConfig;
  };
}

let cachedConfig: BosConfig | null = null;
let configDir: string | null = null;

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

export function loadConfig(cwd?: string): BosConfig {
  if (cachedConfig) return cachedConfig;

  const startDir = cwd ?? process.cwd();
  const configPath = findConfigPathSync(startDir);

  if (!configPath) {
    throw new Error("Could not find bos.config.json in current directory or parents");
  }

  configDir = dirname(configPath);
  const file = Bun.file(configPath);
  const content = require(configPath);
  cachedConfig = content as BosConfig;
  return cachedConfig;
}

export function getConfigDir(): string {
  if (!configDir) {
    loadConfig();
  }
  return configDir!;
}

export function getRemotes(): string[] {
  const config = loadConfig();
  return Object.keys(config.app).filter((k) => k !== "host");
}

export function getPackages(): string[] {
  const config = loadConfig();
  return Object.keys(config.app);
}

export function getRemote(name: string): RemoteConfig | undefined {
  const config = loadConfig();
  const remote = config.app[name];
  if (remote && "name" in remote) {
    return remote as RemoteConfig;
  }
  return undefined;
}

export function getHost(): HostConfig {
  const config = loadConfig();
  return config.app.host;
}

export function getUrl(
  packageName: string,
  env: "development" | "production" = "development"
): string | undefined {
  const config = loadConfig();
  const pkg = config.app[packageName];
  if (!pkg) return undefined;
  return pkg[env];
}

export function getAccount(): string {
  const config = loadConfig();
  return config.account;
}

export function getTitle(): string {
  const config = loadConfig();
  return config.app.host.title;
}

export function getComponentUrl(
  component: "host" | "ui" | "api",
  source: SourceMode
): string {
  const config = loadConfig();

  if (component === "host") {
    if (source === "remote") {
      const remoteUrl = config.app.host.remote;
      if (!remoteUrl) {
        throw new Error("No remote URL configured for host. Run 'bos build host' first.");
      }
      return remoteUrl;
    }
    return config.app.host.development;
  }

  const componentConfig = config.app[component];
  if (!componentConfig || !("name" in componentConfig)) {
    throw new Error(`Component ${component} not found in bos.config.json`);
  }

  return source === "remote" ? componentConfig.production : componentConfig.development;
}

export function getHostRemoteUrl(): string | undefined {
  const config = loadConfig();
  return config.app.host.remote;
}

export function parsePort(url: string): number {
  try {
    const parsed = new URL(url);
    return parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === "https:" ? 443 : 80);
  } catch {
    return 3000;
  }
}

export interface PortConfig {
  host: number;
  ui: number;
  api: number;
}

export function getPortsFromConfig(): PortConfig {
  const config = loadConfig();
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

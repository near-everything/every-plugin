import { DEFAULT_DEV_CONFIG, type DevConfig, getConfigDir, getHostRemoteUrl, type SourceMode } from "../config";
import { type DevOrchestrator, startDev } from "../lib/orchestrator";
import { syncDependencies } from "./sync";

interface DevOptions {
  host?: string;
  ui?: string;
  api?: string;
  proxy?: boolean;
}

function parseSourceMode(value: string | undefined, defaultValue: SourceMode): SourceMode {
  if (value === "local" || value === "remote") return value;
  if (value === "true" || value === "") return "remote";
  return defaultValue;
}

function buildDevConfig(options: DevOptions): DevConfig {
  return {
    host: parseSourceMode(options.host, DEFAULT_DEV_CONFIG.host),
    ui: parseSourceMode(options.ui, DEFAULT_DEV_CONFIG.ui),
    api: parseSourceMode(options.api, DEFAULT_DEV_CONFIG.api),
    proxy: options.proxy,
  };
}

function validateRemoteUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("http")) {
      throw new Error("URL must use http or https protocol");
    }
  } catch {
    console.error(`❌ Invalid remote URL: ${url}`);
    process.exit(1);
  }
}

function validateDevConfig(config: DevConfig): void {
  if (config.host === "remote") {
    const remoteUrl = getHostRemoteUrl();
    if (!remoteUrl) {
      console.error("❌ No remote URL configured for host. Run 'bos build host' first to deploy.");
      console.error("   Or set app.host.remote in bos.config.json");
      process.exit(1);
    }
    validateRemoteUrl(remoteUrl);
    console.warn("⚠️  Loading host from remote URL - ensure this is trusted");
    console.warn(`   ${remoteUrl}\n`);
  }
}

function buildDescription(config: DevConfig): string {
  const parts: string[] = [];
  
  if (config.host === "local" && config.ui === "local" && config.api === "local" && !config.proxy) {
    return "Full Local Development";
  }
  
  if (config.host === "remote") parts.push("Remote Host");
  else parts.push("Local Host");
  
  if (config.ui === "remote") parts.push("Remote UI");
  if (config.proxy) parts.push("Proxy API → Production");
  else if (config.api === "remote") parts.push("Remote API");
  
  return parts.join(" + ");
}

function determineProcesses(config: DevConfig): string[] {
  const processes: string[] = [];
  
  if (config.ui === "local") {
    processes.push("ui-ssr");
    processes.push("ui");
  }
  
  if (config.api === "local" && !config.proxy) {
    processes.push("api");
  }
  
  processes.push("host");
  
  return processes;
}

function buildEnvVars(config: DevConfig): Record<string, string> {
  const env: Record<string, string> = {};
  
  env.HOST_SOURCE = config.host;
  env.UI_SOURCE = config.ui;
  env.API_SOURCE = config.api;
  
  if (config.host === "remote") {
    const remoteUrl = getHostRemoteUrl();
    if (remoteUrl) {
      env.HOST_REMOTE_URL = remoteUrl;
    }
  }
  
  if (config.proxy) {
    env.API_PROXY = "true";
  }
  
  return env;
}

export async function devCommand(options: DevOptions) {
  const hasChanges = await syncDependencies(true);

  if (hasChanges) {
    console.log("  [sync] Detected version drift, updating lockfile...");
    const configDir = getConfigDir();
    const proc = Bun.spawn(["bun", "install", "--silent"], {
      cwd: configDir,
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
    console.log("  [sync] ✓ Dependencies synced\n");
  }

  const devConfig = buildDevConfig(options);
  validateDevConfig(devConfig);
  
  const processes = determineProcesses(devConfig);
  const env = buildEnvVars(devConfig);
  const description = buildDescription(devConfig);

  const orchestrator: DevOrchestrator = {
    packages: processes,
    env,
    description,
    devConfig,
  };

  startDev(orchestrator);
}

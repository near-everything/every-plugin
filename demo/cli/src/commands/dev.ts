import { getConfigDir, getPackages } from "../config";
import { type DevOrchestrator, startDev } from "../lib/orchestrator";
import { syncDependencies } from "./sync";

interface DevOptions {
  ui?: boolean;
  api?: boolean;
  host?: boolean;
  proxy?: boolean;
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

  const packages = getPackages();
  const env: Record<string, string> = {};
  let filters: string[];
  let description: string;

  if (options.ui) {
    env.API_SOURCE = "remote";
    filters = ["host-client", "ui-ssr", "ui", "host"];
    description = "UI Development";
  } else if (options.api) {
    env.UI_SOURCE = "remote";
    filters = ["host-client", "host", "api"];
    description = "API Development";
  } else if (options.host) {
    env.UI_SOURCE = "remote";
    env.API_SOURCE = "remote";
    filters = ["host-client", "host"];
    description = "Host Only";
  } else if (options.proxy) {
    env.API_PROXY = "true";
    filters = ["host-client", "ui-ssr", "ui", "host"];
    description = "Proxy Mode";
  } else {
    filters = [...new Set(["host-client", "ui-ssr", ...packages, "ui", "host"])];
    description = "Full Local";
  }

  const orchestrator: DevOrchestrator = {
    packages: filters,
    env,
    description,
  };

  startDev(orchestrator);
}

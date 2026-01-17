import { getPackages } from "../config";
import { startDev, type DevOrchestrator } from "../lib/orchestrator";

interface DevOptions {
  ui?: boolean;
  api?: boolean;
  host?: boolean;
  proxy?: boolean;
}

export async function devCommand(options: DevOptions) {
  const packages = getPackages();
  const env: Record<string, string> = {};
  let filters: string[];
  let description: string;

  if (options.ui) {
    env.API_SOURCE = "remote";
    filters = ["host", "ui"];
    description = "UI Development";
  } else if (options.api) {
    env.UI_SOURCE = "remote";
    filters = ["host", "api"];
    description = "API Development";
  } else if (options.host) {
    env.UI_SOURCE = "remote";
    env.API_SOURCE = "remote";
    filters = ["host"];
    description = "Host Only";
  } else if (options.proxy) {
    env.API_PROXY = "true";
    filters = ["host", "ui"];
    description = "Proxy Mode";
  } else {
    filters = packages;
    description = "Full Local";
  }

  const orchestrator: DevOrchestrator = {
    packages: filters,
    env,
    description,
  };

  startDev(orchestrator);
}

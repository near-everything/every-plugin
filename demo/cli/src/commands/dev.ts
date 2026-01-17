import { getPackages, getRemotes } from "../config";
import { run } from "../utils/run";
import { colors, icons, gradients, divider } from "../utils/theme";

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

  console.log();
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log(`  ${icons.run} ${gradients.cyber(`LAUNCHING ${description}`)}`);
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log();

  console.log(`  ${icons.config} ${colors.bold("Config")}`);
  console.log(colors.dim(`  |- packages: ${filters.join(", ")}`));
  if (Object.keys(env).length) {
    for (const [k, v] of Object.entries(env)) {
      console.log(colors.dim(`  |- ${k}=${v}`));
    }
  }
  console.log();

  console.log(colors.dim(divider(48)));
  console.log();

  await run("turbo", ["dev", ...filters.map((f) => `--filter=${f}`)], { env });
}

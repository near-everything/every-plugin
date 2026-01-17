import { getPackages } from "../config";
import { run } from "../utils/run";
import { colors, icons, gradients, divider } from "../utils/theme";

interface BuildOptions {
  force?: boolean;
}

export async function buildCommand(pkg: string, options: BuildOptions) {
  const packages = getPackages();

  if (pkg !== "all" && !packages.includes(pkg)) {
    console.error(colors.magenta(`${icons.err} Unknown package: ${pkg}`));
    console.log(colors.dim(`   Available: ${packages.join(", ")}`));
    process.exit(1);
  }

  console.log();
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log(`  ${icons.pkg} ${gradients.cyber(`BUILDING ${pkg}`)}`);
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log();

  const args = ["build"];
  if (options.force) args.push("--force");
  if (pkg !== "all") args.push(`--filter=${pkg}`);

  await run("turbo", args);

  console.log();
  console.log(colors.neonGreen(`  ${icons.ok} Build complete`));
  console.log();
}

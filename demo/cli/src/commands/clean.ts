import { getPackages } from "../config";
import { run } from "../utils/run";
import { colors, icons, gradients } from "../utils/theme";

export async function cleanCommand() {
  const packages = getPackages();
  const distPaths = packages.map((p) => `${p}/dist`);

  console.log();
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log(`  ${icons.clean} ${gradients.cyber("CLEANING ARTIFACTS")}`);
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log();

  console.log(colors.dim(`  |- ${distPaths.join(", ")}`));
  console.log(colors.dim(`  |- .turbo`));
  console.log(colors.dim(`  |- node_modules/.cache`));
  console.log();

  await run("rm", ["-rf", ...distPaths, ".turbo", "node_modules/.cache"]);

  console.log(colors.neonGreen(`  ${icons.ok} Clean complete`));
  console.log();
}

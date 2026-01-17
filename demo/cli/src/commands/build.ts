import { getPackages, getConfigDir } from "../config";
import { run } from "../utils/run";
import { colors, icons, gradients, divider } from "../utils/theme";

interface BuildOptions {
  force?: boolean;
}

const buildCommands: Record<string, { cmd: string; args: string[] }> = {
  host: { cmd: "rsbuild", args: ["build"] },
  ui: { cmd: "rsbuild", args: ["build"] },
  api: { cmd: "rspack", args: ["build"] },
};

export async function buildCommand(pkg: string, options: BuildOptions) {
  const packages = getPackages();
  const cwd = getConfigDir();

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

  const targets = pkg === "all" ? packages : [pkg];

  for (const target of targets) {
    const buildConfig = buildCommands[target];
    if (!buildConfig) {
      console.log(colors.dim(`  |- Skipping ${target} (no build config)`));
      continue;
    }

    console.log(
      `  ${icons.run} ${gradients.neon(target.toUpperCase())} ${colors.dim(`→ ${buildConfig.cmd} ${buildConfig.args.join(" ")}`)}`
    );

    await run("bun", ["run", buildConfig.cmd, ...buildConfig.args], {
      cwd: `${cwd}/${target}`,
    });
  }

  console.log();
  console.log(colors.neonGreen(`  ${icons.ok} Build complete`));
  console.log();
}

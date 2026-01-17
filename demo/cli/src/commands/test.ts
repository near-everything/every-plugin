import { getPackages, getConfigDir } from "../config";
import { run } from "../utils/run";
import { colors, icons, gradients } from "../utils/theme";

interface TestOptions {
  filter?: string;
  watch?: boolean;
}

export async function testCommand(options: TestOptions) {
  const packages = getPackages();
  const testable = packages.filter((p) => p !== "ui");
  const filter = options.filter ?? "all";
  const cwd = getConfigDir();

  console.log();
  console.log(colors.cyan(`+${"-".repeat(46)}+`));

  if (filter === "all") {
    console.log(`  ${icons.test} ${gradients.cyber("RUNNING ALL TESTS")}`);
    console.log(colors.cyan(`+${"-".repeat(46)}+`));
    console.log();

    for (const pkg of testable) {
      console.log(
        `  ${icons.run} ${gradients.neon(pkg.toUpperCase())} ${colors.dim("→ vitest run")}`
      );
      await run("bun", ["run", "test"], { cwd: `${cwd}/${pkg}` });
    }
  } else {
    if (!packages.includes(filter)) {
      console.error(colors.magenta(`${icons.err} Unknown package: ${filter}`));
      console.log(colors.dim(`   Available: ${packages.join(", ")}`));
      process.exit(1);
    }
    console.log(`  ${icons.test} ${gradients.cyber(`TESTING ${filter}`)}`);
    console.log(colors.cyan(`+${"-".repeat(46)}+`));
    console.log();
    await run("bun", ["run", "test"], { cwd: `${cwd}/${filter}` });
  }

  console.log();
  console.log(colors.neonGreen(`  ${icons.ok} Tests complete`));
  console.log();
}

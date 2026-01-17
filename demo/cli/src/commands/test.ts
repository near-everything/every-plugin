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
    await run("turbo", ["test", ...testable.map((p) => `--filter=${p}`)]);
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

export async function testSsrCommand(options: { watch?: boolean }) {
  const cwd = getConfigDir();

  console.log();
  console.log(colors.cyan(`+${"-".repeat(46)}+`));

  if (options.watch) {
    console.log(`  ${icons.scan} ${gradients.cyber("SSR WATCH MODE")}`);
    console.log(colors.cyan(`+${"-".repeat(46)}+`));
    console.log();
    console.log(colors.dim("   Rebuilds UI and reruns tests on changes"));
    console.log();
    await run("turbo", ["watch", "build", "--filter=ui"]);
  } else {
    console.log(`  ${icons.test} ${gradients.cyber("SSR INTEGRATION TESTS")}`);
    console.log(colors.cyan(`+${"-".repeat(46)}+`));
    console.log();
    await run("bun", ["run", "test", "--", "tests/integration/ssr.test.ts"], {
      cwd: `${cwd}/host`,
    });
    console.log();
    console.log(colors.neonGreen(`  ${icons.ok} SSR tests complete`));
    console.log();
  }
}

import { getPackages, getConfigDir } from "../config";
import { colors, icons, gradients } from "../utils/theme";

export async function cleanCommand() {
  const packages = getPackages();
  const cwd = getConfigDir();
  const distPaths = packages.map((p) => `${p}/dist`);

  console.log();
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log(`  ${icons.clean} ${gradients.cyber("CLEANING ARTIFACTS")}`);
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log();

  console.log(colors.dim(`  |- ${distPaths.join(", ")}`));
  console.log(colors.dim(`  |- node_modules/.cache`));
  console.log(colors.dim(`  |- .bos/logs (keeping last 5)`));
  console.log();

  const rmPaths = [...distPaths, "node_modules/.cache"];
  
  const proc = Bun.spawn(["rm", "-rf", ...rmPaths], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;

  const logsDir = `${cwd}/.bos/logs`;
  try {
    const glob = new Bun.Glob("dev-*.log");
    const files: string[] = [];
    for await (const file of glob.scan({ cwd: logsDir })) {
      files.push(file);
    }
    files.sort().reverse();
    
    const toDelete = files.slice(5);
    if (toDelete.length > 0) {
      const delProc = Bun.spawn(["rm", "-f", ...toDelete.map(f => `${logsDir}/${f}`)], {
        stdout: "inherit",
        stderr: "inherit",
      });
      await delProc.exited;
      console.log(colors.dim(`  |- Removed ${toDelete.length} old log files`));
    }
  } catch {
    // No logs directory yet
  }

  console.log();
  console.log(colors.neonGreen(`  ${icons.ok} Clean complete`));
  console.log();
}

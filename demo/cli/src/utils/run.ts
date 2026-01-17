import { execa, type Options as ExecaOptions } from "execa";
import chalk from "chalk";
import { getConfigDir } from "../config";

export async function run(
  cmd: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {}
) {
  console.log(chalk.dim(`$ ${cmd} ${args.join(" ")}`));
  const execaOptions: ExecaOptions = {
    cwd: options.cwd ?? getConfigDir(),
    stdio: "inherit",
    reject: false,
    env: options.env ? { ...process.env, ...options.env } : undefined,
  };
  const result = await execa(cmd, args, execaOptions);
  if (result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
}

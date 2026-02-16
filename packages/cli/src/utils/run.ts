import chalk from "chalk";
import { type Options as ExecaOptions, execa } from "execa";
import { getProjectRoot } from "../config";

export async function run(
	cmd: string,
	args: string[],
	options: { cwd?: string; env?: Record<string, string> } = {},
) {
	console.log(chalk.dim(`$ ${cmd} ${args.join(" ")}`));

	// Get project root, fallback to cwd if config not loaded
	let cwd = options.cwd;
	if (!cwd) {
		try {
			cwd = getProjectRoot();
		} catch {
			cwd = process.cwd();
		}
	}

	const execaOptions: ExecaOptions = {
		cwd,
		stdio: "inherit",
		reject: false,
		env: options.env ? { ...process.env, ...options.env } : undefined,
	};
	const result = await execa(cmd, args, execaOptions);
	if (result.exitCode !== 0) {
		process.exit(result.exitCode);
	}
}

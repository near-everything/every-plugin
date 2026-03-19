#!/usr/bin/env bun
import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cliPath = join(__dirname, "src", "cli.ts");

const child = spawn("bun", ["run", cliPath, ...process.argv.slice(2)], {
	stdio: "inherit",
	shell: true,
});

child.on("exit", (code) => {
	process.exit(code ?? 0);
});

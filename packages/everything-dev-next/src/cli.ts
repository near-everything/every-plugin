#!/usr/bin/env node
import { Effect } from "effect";
import {
	type AppOrchestrator,
	buildRuntimeConfig,
	detectLocalPackages,
	startDevServers,
} from "./app";
import {
	findConfigPath,
	getProjectRoot,
	loadConfig,
	parsePort,
} from "./config";
import { createDevLogger, readDevLatestLog } from "./dev-logs";
import { createHostServer } from "./host";
import { makeProcessRegistry } from "./process-registry";
import { syncAndGenerateSharedUi } from "./shared";

async function getListeningPids(port: number): Promise<number[]> {
	try {
		const proc = Bun.spawn({
			cmd: ["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
			stdout: "pipe",
			stderr: "ignore",
		});
		const out = await new Response(proc.stdout).text();
		await proc.exited;
		return out
			.split("\n")
			.map((s) => s.trim())
			.filter(Boolean)
			.map((s) => Number(s))
			.filter((n) => Number.isFinite(n));
	} catch {
		return [];
	}
}

async function assertPortsFree(ports: Array<{ name: string; port: number }>) {
	const busy: Array<{ name: string; port: number; pids: number[] }> = [];
	for (const p of ports) {
		if (!p.port) continue;
		const pids = await getListeningPids(p.port);
		if (pids.length > 0) {
			busy.push({ ...p, pids });
		}
	}

	if (busy.length === 0) return;

	console.error(
		"\n[CLI] Ports are in use; refusing to auto-shift ports in dev.",
	);
	for (const b of busy) {
		console.error(
			`  - ${b.name}: :${b.port} (pid${b.pids.length === 1 ? "" : "s"}: ${b.pids.join(", ")})`,
		);
	}
	const allPids = Array.from(new Set(busy.flatMap((b) => b.pids)));
	if (allPids.length > 0) {
		console.error(`\nKill them with:`);
		console.error(`  kill -TERM ${allPids.join(" ")} || true`);
		console.error(`  kill -KILL ${allPids.join(" ")} || true`);
	}
	console.error("\nTo inspect:");
	for (const b of busy) {
		console.error(`  lsof -nP -iTCP:${b.port} -sTCP:LISTEN`);
	}
	process.exit(1);
}

async function main() {
	const args = process.argv.slice(2);
	const command = args[0] ?? "dev";

	if (command === "logs") {
		const tailIdx = args.findIndex((a) => a === "--tail" || a === "-n");
		const tail = tailIdx !== -1 ? Number(args[tailIdx + 1] ?? "0") : undefined;
		const configPath = findConfigPath();
		const configDir = configPath
			? configPath.replace(/\/bos\.config\.json$/, "")
			: process.cwd();
		const text = await readDevLatestLog(configDir, { tail });
		process.stdout.write(text || "(no logs found)\n");
		return;
	}

	const env = command === "start" ? "production" : "development";

	console.log(`[CLI] Running: ${command}`);

	const result = await loadConfig({ env });

	if (!result) {
		console.error("[CLI] No bos.config.json found");
		process.exit(1);
	}

	console.log(`[CLI] Config loaded from: ${result.source.path}`);
	console.log(`[CLI] Account: ${result.config.account}`);
	console.log(`[CLI] Environment: ${env}`);

	const configDir = getProjectRoot();

	const LOG_NOISE_PATTERNS = [
		/\[ Federation Runtime \] Version .* from (host|ui) of shared singleton module/,
		/Executing an Effect versioned \d+\.\d+\.\d+ with a Runtime of version/,
		/you may want to dedupe the effect dependencies/,
	];
	const shouldDisplayLog = (line: string): boolean =>
		process.env.DEBUG === "true" || process.env.DEBUG === "1"
			? true
			: !LOG_NOISE_PATTERNS.some((p) => p.test(line));

	await syncAndGenerateSharedUi({
		configDir,
		hostMode: env === "development" ? "local" : "remote",
	});

	console.log(`[CLI] Shared deps synced`);

	const localPackages = detectLocalPackages();
	console.log(`[CLI] Local packages: ${localPackages.join(", ")}`);

	const port = Number(process.env.PORT ?? "3000") || 3000;

	const uiSource =
		process.env.UI_SOURCE === "remote"
			? "remote"
			: localPackages.includes("ui")
				? "local"
				: "remote";
	const apiSource =
		process.env.API_SOURCE === "remote"
			? "remote"
			: localPackages.includes("api")
				? "local"
				: "remote";

	console.log(`[CLI] UI source: ${uiSource}`);
	console.log(`[CLI] API source: ${apiSource}`);

	const runtimeConfig = buildRuntimeConfig(result.config, {
		uiSource,
		apiSource,
		hostUrl: `http://localhost:${port}`,
		env,
	});

	// Filter out 'host' from packages to start - we'll run it in-process
	const packagesToStart = localPackages.filter((pkg) => {
		if (pkg === "host") return false;
		if (pkg === "ui" && uiSource === "remote") return false;
		if (pkg === "ui-ssr" && uiSource === "remote") return false;
		if (pkg === "api" && apiSource === "remote") return false;
		return true;
	});

	const description = `${result.config.account} - ${env}`;
	const logger = await createDevLogger(configDir, description);
	const logCli = (line: string) => {
		console.log(line);
		void logger.write({ timestamp: Date.now(), source: "cli", line });
	};
	const registry = await Effect.runPromise(makeProcessRegistry(configDir));

	// Clean up any previously tracked dev processes to avoid port conflicts.
	await Effect.runPromise(registry.killAll()).catch(() => {});

	// Refuse to run if ports are already taken. If rsbuild/rspack silently
	// chooses a different port, runtimeConfig becomes incorrect and remotes fail.
	{
		const ports: Array<{ name: string; port: number }> = [
			{ name: "host", port },
		];
		if (uiSource === "local" && result.config.app.ui?.development) {
			const uiPort = parsePort(result.config.app.ui.development);
			ports.push({ name: "ui", port: uiPort });
			ports.push({ name: "ui-ssr", port: uiPort + 1 });
		}
		if (apiSource === "local" && result.config.app.api?.development) {
			ports.push({
				name: "api",
				port: parsePort(result.config.app.api.development),
			});
		}
		await assertPortsFree(ports);
	}

	const callbacks = {
		onStatus: (
			name: string,
			status: "pending" | "starting" | "ready" | "error",
			message?: string,
		) => {
			const statusIcon =
				status === "ready" ? "✓" : status === "error" ? "✗" : "○";
			const line = `[${statusIcon}] ${name}: ${status}${message ? ` - ${message}` : ""}`;
			console.log(line);
			void logger.write({ timestamp: Date.now(), source: name, line });
		},
		onLog: (name: string, line: string, isError?: boolean) => {
			if (shouldDisplayLog(line)) {
				const stream = isError ? process.stderr : process.stdout;
				stream.write(`[${name}] ${line}\n`);
			}
			void logger.write({ timestamp: Date.now(), source: name, line, isError });
		},
	};

	let devHandle: { shutdown: Effect.Effect<void> } | null = null;

	// Start child processes (ui, api) without blocking host startup
	if (packagesToStart.length > 0) {
		const orchestrator: AppOrchestrator = {
			packages: packagesToStart,
			env: {
				UI_SOURCE: uiSource,
				API_SOURCE: apiSource,
				...(process.env as Record<string, string>),
			},
			description,
			bosConfig: result.config,
			runtimeConfig,
			port,
		};

		logCli(`\n${"=".repeat(70)}`);
		logCli(`  ${description}`);
		logCli(`  Environment: ${runtimeConfig.env}`);
		logCli(`  Logs: ${logger.logFile}`);
		logCli(`${"=".repeat(70)}\n`);

		devHandle = await Effect.runPromise(
			startDevServers(orchestrator, callbacks, registry).pipe(
				Effect.catchAll((e) =>
					Effect.sync(() => {
						throw e;
					}),
				),
			),
		);
	}

	// Start host server in-process (after locals are up)
	logCli(`[CLI] Starting host server...`);
	const server = createHostServer({ runtimeConfig, configDir, port });
	await server.ready;

	logCli(`\n${"=".repeat(70)}`);
	logCli(`  Host server listening`);
	logCli(`  Host: http://localhost:${port}`);
	logCli(`  Ready: http://localhost:${port}/ready`);
	logCli(`  Logs: ${logger.latestFile}`);
	logCli(`${"=".repeat(70)}\n`);

	// Non-blocking: report when the full stack becomes ready.
	void (async () => {
		const url = `http://localhost:${port}/ready`;
		const deadline = Date.now() + 120_000;
		while (Date.now() < deadline) {
			try {
				const res = await fetch(url);
				if (res.ok) {
					logCli(`[CLI] Stack ready: ${url}`);
					return;
				}
			} catch {}
			await new Promise((r) => setTimeout(r, 300));
		}
		logCli(`[CLI] Stack not ready yet (timeout): ${url}`);
	})();

	const shutdownAll = async () => {
		logCli("\n[CLI] Shutting down...");
		if (devHandle) {
			await Effect.runPromise(devHandle.shutdown).catch(() => {});
		}
		await server.shutdown().catch(() => {});
	};

	process.on("SIGINT", () => {
		shutdownAll().finally(() => process.exit(0));
	});
	process.on("SIGTERM", () => {
		shutdownAll().finally(() => process.exit(0));
	});

	await new Promise<void>(() => {});
}

main().catch((error) => {
	console.error("[CLI] Fatal error:", error);
	process.exit(1);
});

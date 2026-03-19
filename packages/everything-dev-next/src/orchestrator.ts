import { createConnection } from "node:net";
import { Deferred, Effect, Fiber, Ref } from "effect";
import { getProjectRoot, parsePort } from "./config";
import type { ProcessRegistry } from "./process-registry";
import type { BosConfig, RuntimeConfig } from "./types";

export interface DevProcess {
	name: string;
	command: string;
	args: string[];
	cwd: string;
	env?: Record<string, string>;
	port: number;
	readyPatterns: RegExp[];
	errorPatterns: RegExp[];
}

export interface ProcessCallbacks {
	onStatus: (name: string, status: ProcessStatus, message?: string) => void;
	onLog: (name: string, line: string, isError?: boolean) => void;
}

export interface ProcessHandle {
	name: string;
	pid: number | undefined;
	kill: () => Promise<void>;
	waitForReady: Effect.Effect<void>;
	waitForExit: Effect.Effect<unknown>;
}

export type ProcessStatus = "pending" | "starting" | "ready" | "error";

interface ProcessConfigBase {
	name: string;
	command: string;
	args: string[];
	cwd: string;
	readyPatterns: RegExp[];
	errorPatterns: RegExp[];
}

const processConfigBases: Record<string, ProcessConfigBase> = {
	"host-build": {
		name: "host-build",
		command: "bun",
		args: ["run", "build:watch"],
		cwd: "host",
		readyPatterns: [/built in/i, /compiled.*successfully/i],
		errorPatterns: [/error:/i, /failed/i, /exception/i],
	},
	host: {
		name: "host",
		command: "bun",
		args: ["run", "dev"],
		cwd: "host",
		readyPatterns: [
			/Host (dev|production) server running at/i,
			/Server running at/i,
		],
		errorPatterns: [/error:/i, /failed/i, /exception/i],
	},
	ui: {
		name: "ui",
		command: "bun",
		args: ["run", "dev"],
		cwd: "ui",
		// Wait for the client build (mf) specifically, not just SSR.
		readyPatterns: [
			/\bready\s+built in\b/i,
			/\bLocal:\b/i,
			/\bcompiled\b.*successfully/i,
		],
		errorPatterns: [/error/i, /failed to compile/i],
	},
	"ui-ssr": {
		name: "ui-ssr",
		command: "bun",
		args: ["x", "rsbuild", "dev", "--environment", "mf-ssr"],
		cwd: "ui",
		readyPatterns: [/\bready\s+built in\b/i, /\bcompiled\b.*successfully/i],
		errorPatterns: [/error/i, /failed/i],
	},
	api: {
		name: "api",
		command: "bun",
		args: ["run", "dev"],
		cwd: "api",
		readyPatterns: [
			/ready in/i,
			/compiled.*successfully/i,
			/listening/i,
			/started/i,
		],
		errorPatterns: [/error/i, /failed/i],
	},
};

export function getProcessConfig(
	pkg: string,
	env?: Record<string, string>,
	portOverride?: number,
	bosConfig?: BosConfig,
): DevProcess | null {
	const base = processConfigBases[pkg];
	if (!base) return null;

	let port: number;
	if (pkg === "host") {
		port =
			portOverride ??
			(bosConfig ? parsePort(bosConfig.app.host.development) : 3000);
	} else if (pkg === "ui") {
		port = bosConfig?.app?.ui
			? parsePort(bosConfig.app.ui.development ?? "http://localhost:3002")
			: 3002;
	} else if (pkg === "ui-ssr") {
		const uiPort = bosConfig?.app?.ui
			? parsePort(bosConfig.app.ui.development ?? "http://localhost:3002")
			: 3002;
		port = uiPort + 1;
	} else if (pkg === "api") {
		port = bosConfig?.app?.api
			? parsePort(bosConfig.app.api.development ?? "http://localhost:3014")
			: 3014;
	} else {
		port = 0;
	}

	return { ...base, port, env };
}

const stripAnsi = (input: string): string => {
	const ESC = String.fromCharCode(27);
	const BEL = String.fromCharCode(7);
	return input
		.replace(new RegExp(`${ESC}\\][^${BEL}]*${BEL}`, "g"), "")
		.replace(new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, "g"), "");
};

const probeHttpOk = async (url: string, timeoutMs = 400): Promise<boolean> => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, { signal: controller.signal });
		return res.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
};

const probeTcpOpen = async (
	port: number,
	timeoutMs = 250,
): Promise<boolean> => {
	return new Promise((resolve) => {
		const socket = createConnection({ host: "127.0.0.1", port });
		const timer = setTimeout(() => {
			socket.destroy();
			resolve(false);
		}, timeoutMs);
		socket.once("connect", () => {
			clearTimeout(timer);
			socket.destroy();
			resolve(true);
		});
		socket.once("error", () => {
			clearTimeout(timer);
			resolve(false);
		});
	});
};

const detectStatus = (
	line: string,
	config: DevProcess,
): { status: ProcessStatus; isError: boolean } | null => {
	const cleanLine = stripAnsi(line);
	for (const pattern of config.errorPatterns) {
		if (pattern.test(cleanLine)) {
			return { status: "error", isError: true };
		}
	}
	for (const pattern of config.readyPatterns) {
		if (pattern.test(cleanLine)) {
			return { status: "ready", isError: false };
		}
	}
	return null;
};

const killProcessTree = (pid: number) =>
	Effect.gen(function* () {
		const killSignal = (signal: NodeJS.Signals) =>
			Effect.try({
				try: () => {
					process.kill(-pid, signal);
				},
				catch: () => null,
			}).pipe(Effect.ignore);

		const killDirect = (signal: NodeJS.Signals) =>
			Effect.try({
				try: () => {
					process.kill(pid, signal);
				},
				catch: () => null,
			}).pipe(Effect.ignore);

		const isRunning = () =>
			Effect.try({
				try: () => {
					process.kill(pid, 0);
					return true;
				},
				catch: () => false,
			});

		yield* killSignal("SIGTERM");
		yield* killDirect("SIGTERM");

		yield* Effect.sleep("200 millis");

		const stillRunning = yield* isRunning();
		if (stillRunning) {
			yield* killSignal("SIGKILL");
			yield* killDirect("SIGKILL");
			yield* Effect.sleep("100 millis");
		}
	});

export const spawnDevProcess = (
	config: DevProcess,
	callbacks: ProcessCallbacks,
	runtimeConfig?: RuntimeConfig,
	registry?: ProcessRegistry,
) =>
	Effect.gen(function* () {
		let configDir: string;
		try {
			configDir = getProjectRoot();
		} catch {
			configDir = process.cwd();
		}
		const fullCwd = `${configDir}/${config.cwd}`;
		const readyDeferred = yield* Deferred.make<void, Error>();
		const statusRef = yield* Ref.make<ProcessStatus>("starting");

		callbacks.onStatus(config.name, "starting");

		const envVars: Record<string, string> = {
			...(process.env as Record<string, string>),
			...config.env,
			FORCE_COLOR: "1",
			...(config.port > 0 ? { PORT: String(config.port) } : {}),
		};

		if (runtimeConfig && config.name === "host") {
			envVars.BOS_RUNTIME_CONFIG = JSON.stringify(runtimeConfig);
		}

		const proc = Bun.spawn({
			cmd: [config.command, ...config.args],
			cwd: fullCwd,
			env: envVars,
			stdio: ["inherit", "pipe", "pipe"],
		});

		const markReady = Effect.gen(function* () {
			const currentStatus = yield* Ref.get(statusRef);
			if (currentStatus === "ready" || currentStatus === "error") return;
			yield* Ref.set(statusRef, "ready");
			callbacks.onStatus(config.name, "ready");
			yield* Deferred.succeed(readyDeferred, undefined).pipe(Effect.ignore);
		});

		// Prefer probe-based readiness to avoid brittle log regexes.
		// This is best-effort and complements log detection.
		if (config.port > 0) {
			const url = (() => {
				switch (config.name) {
					case "ui":
					case "api":
						return `http://127.0.0.1:${config.port}/remoteEntry.js`;
					case "ui-ssr":
						return `http://127.0.0.1:${config.port}/`;
					default:
						return null;
				}
			})();

			yield* Effect.fork(
				Effect.gen(function* () {
					const deadline = Date.now() + 90_000;
					while (Date.now() < deadline) {
						const status = yield* Ref.get(statusRef);
						if (status === "ready" || status === "error") return;
						const ok = url
							? yield* Effect.tryPromise({
									try: () => probeHttpOk(url),
									catch: () => false,
								})
							: yield* Effect.tryPromise({
									try: () => probeTcpOpen(config.port),
									catch: () => false,
								});
						if (ok) {
							yield* markReady;
							return;
						}
						yield* Effect.sleep("200 millis");
					}
				}),
			);
		}

		if (registry && proc.pid) {
			yield* registry.track({
				pid: proc.pid,
				name: config.name,
				port: config.port,
				startedAt: Date.now(),
				command: [config.command, ...config.args].join(" "),
			});
		}

		yield* Effect.fork(
			Effect.promise(() => proc.exited).pipe(
				Effect.andThen((code) =>
					Effect.gen(function* () {
						if (registry && proc.pid) {
							yield* registry.untrack(proc.pid).pipe(Effect.ignore);
						}
						const currentStatus = yield* Ref.get(statusRef);
						if (currentStatus === "ready") return;
						callbacks.onLog(
							config.name,
							`Process exited before ready (exit code: ${code})`,
							true,
						);
						yield* Ref.set(statusRef, "error");
						callbacks.onStatus(config.name, "error");
						yield* Deferred.fail(
							readyDeferred,
							new Error(`Process exited before ready: ${config.name}`),
						).pipe(Effect.ignore);
					}),
				),
			),
		);

		const handleLine = (line: string, isStderr: boolean) =>
			Effect.gen(function* () {
				if (!line.trim()) return;

				callbacks.onLog(config.name, line, isStderr);

				const currentStatus = yield* Ref.get(statusRef);
				if (currentStatus === "ready") return;

				const detected = detectStatus(line, config);
				if (detected) {
					yield* Ref.set(statusRef, detected.status);
					callbacks.onStatus(config.name, detected.status);
					if (detected.status === "ready" || detected.status === "error") {
						if (detected.status === "ready") {
							yield* Deferred.succeed(readyDeferred, undefined).pipe(
								Effect.ignore,
							);
						} else {
							yield* Deferred.fail(
								readyDeferred,
								new Error(`Process failed: ${config.name}`),
							).pipe(Effect.ignore);
						}
					}
				}
			});

		const decoder = new TextDecoder();

		const stdoutFiber = yield* Effect.fork(
			Effect.async<void>((resume) => {
				if (!proc.stdout) {
					resume(Effect.void);
					return;
				}
				const reader = proc.stdout.getReader();
				let buffer = "";

				const pump = (): Promise<void> =>
					reader.read().then(({ done, value }) => {
						if (done) {
							if (buffer) {
								Effect.runSync(handleLine(buffer, false));
							}
							return;
						}
						buffer += decoder.decode(value, { stream: true });
						const lines = buffer.split("\n");
						buffer = lines.pop() ?? "";
						for (const line of lines) {
							Effect.runSync(handleLine(line, false));
						}
						return pump();
					});

				pump().then(() => resume(Effect.void));
			}),
		);

		const stderrFiber = yield* Effect.fork(
			Effect.async<void>((resume) => {
				if (!proc.stderr) {
					resume(Effect.void);
					return;
				}
				const reader = proc.stderr.getReader();
				let buffer = "";

				const pump = (): Promise<void> =>
					reader.read().then(({ done, value }) => {
						if (done) {
							if (buffer) {
								Effect.runSync(handleLine(buffer, true));
							}
							return;
						}
						buffer += decoder.decode(value, { stream: true });
						const lines = buffer.split("\n");
						buffer = lines.pop() ?? "";
						for (const line of lines) {
							Effect.runSync(handleLine(line, true));
						}
						return pump();
					});

				pump().then(() => resume(Effect.void));
			}),
		);

		const handle: ProcessHandle = {
			name: config.name,
			pid: proc.pid,
			kill: async () => {
				const pid = proc.pid;
				if (pid) {
					await Effect.runPromise(killProcessTree(pid));
				} else {
					proc.kill("SIGTERM");
					await new Promise((r) => setTimeout(r, 100));
					try {
						proc.kill("SIGKILL");
					} catch {}
				}
			},
			waitForReady: Deferred.await(readyDeferred),
			waitForExit: Effect.gen(function* () {
				yield* Fiber.joinAll([stdoutFiber, stderrFiber]);
				return yield* Effect.promise(() => proc.exited);
			}),
		};

		return handle;
	});

export const makeDevProcess = (
	pkg: string,
	env: Record<string, string> | undefined,
	callbacks: ProcessCallbacks,
	portOverride?: number,
	bosConfig?: BosConfig,
	runtimeConfig?: RuntimeConfig,
	registry?: ProcessRegistry,
) =>
	Effect.gen(function* () {
		const config = getProcessConfig(pkg, env, portOverride, bosConfig);
		if (!config) {
			return yield* Effect.fail(new Error(`Unknown package: ${pkg}`));
		}

		return yield* spawnDevProcess(config, callbacks, runtimeConfig, registry);
	});

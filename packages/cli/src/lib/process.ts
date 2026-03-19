import { Deferred, Effect, Fiber, Ref } from "every-plugin/effect";
import type { ProcessStatus } from "../components/dev-view";
import {
	type BosConfig,
	getProjectRoot,
	parsePort,
	type RemoteConfig,
	type SourceMode,
} from "../config";
import { patchManifestFetchForSsrPublicPath } from "../mf";
import type { RuntimeConfig } from "../types";

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
		readyPatterns: [/Host (dev|production) server running at/i],
		errorPatterns: [
			/error:/i,
			/failed/i,
			/exception/i,
			// node --watch prints this when the script exits immediately
			/Completed running '.+'. Waiting for file changes/i,
		],
	},
	ui: {
		name: "ui",
		command: "bun",
		args: ["run", "dev"],
		cwd: "ui",
		readyPatterns: [/ready in/i, /compiled.*successfully/i, /➜.*local:/i],
		errorPatterns: [/error/i, /failed to compile/i],
	},
	"ui-ssr": {
		name: "ui-ssr",
		// Spawn rsbuild directly so dev works even if package.json scripts are out of sync.
		command: "bun",
		args: ["x", "rsbuild", "dev", "--environment", "mf-ssr"],
		cwd: "ui",
		readyPatterns: [/ready in/i, /compiled.*successfully/i, /➜.*local:/i],
		errorPatterns: [/error/i, /failed/i],
	},
	api: {
		name: "api",
		command: "bun",
		args: ["run", "dev"],
		cwd: "api",
		readyPatterns: [/Plugin dev server ready/i, /listening/i, /started/i],
		errorPatterns: [/error/i, /failed/i],
	},
};

export const getProcessConfig = (
	pkg: string,
	env?: Record<string, string>,
	portOverride?: number,
	bosConfig?: BosConfig,
): DevProcess | null => {
	const base = processConfigBases[pkg];
	if (!base) return null;

	// Use config if provided, otherwise defaults
	let port: number;
	if (pkg === "host") {
		port =
			portOverride ??
			(bosConfig ? parsePort(bosConfig.app.host.development) : 3000);
	} else if (pkg === "ui") {
		port = bosConfig?.app?.ui
			? parsePort((bosConfig.app.ui as RemoteConfig).development)
			: 3002;
	} else if (pkg === "ui-ssr") {
		const uiPort = bosConfig?.app?.ui
			? parsePort((bosConfig.app.ui as RemoteConfig).development)
			: 3002;
		port = uiPort + 1;
	} else if (pkg === "api") {
		port = bosConfig?.app?.api
			? parsePort((bosConfig.app.api as RemoteConfig).development)
			: 3014;
	} else {
		port = 0;
	}

	const processEnv = env;

	return { ...base, port, env: processEnv };
};

export interface ProcessCallbacks {
	onStatus: (name: string, status: ProcessStatus, message?: string) => void;
	onLog: (name: string, line: string, isError?: boolean) => void;
}

export interface ProcessHandle {
	name: string;
	pid: number | undefined;
	kill: () => Promise<void>;
	waitForReady: Effect.Effect<void>;
	waitForExit: Effect.Effect<unknown, unknown>;
}

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

const stripAnsi = (input: string): string => {
	// Covers CSI (ESC[...m) and common OSC sequences (eg hyperlinks).
	const ESC = String.fromCharCode(27);
	const BEL = String.fromCharCode(7);
	return input
		.replace(new RegExp(`${ESC}\\][^${BEL}]*${BEL}`, "g"), "")
		.replace(new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, "g"), "");
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

export function buildRuntimeConfig(
	bosConfig: BosConfig,
	options: {
		uiSource: SourceMode;
		apiSource: SourceMode;
		hostUrl: string;
		proxy?: string;
		env?: "development" | "production";
	},
): RuntimeConfig {
	const uiConfig = bosConfig.app.ui as RemoteConfig;
	const apiConfig = bosConfig.app.api as RemoteConfig;

	return {
		env: options.env ?? "development",
		account: bosConfig.account,
		hostUrl: options.hostUrl,
		shared: (bosConfig as { shared?: { ui?: Record<string, unknown> } })
			.shared as RuntimeConfig["shared"],
		ui: {
			name: uiConfig.name,
			url:
				options.uiSource === "remote"
					? uiConfig.production
					: uiConfig.development,
			entry: `${
				options.uiSource === "remote"
					? uiConfig.production
					: uiConfig.development
			}/mf-manifest.json`,
			source: options.uiSource,
			ssrUrl:
				options.uiSource === "remote"
					? uiConfig.ssr
					: `http://localhost:${parsePort(uiConfig.development) + 1}`,
		},
		api: {
			name: apiConfig.name,
			url:
				options.apiSource === "remote"
					? apiConfig.production
					: apiConfig.development,
			entry: `${
				options.apiSource === "remote"
					? apiConfig.production
					: apiConfig.development
			}/mf-manifest.json`,
			source: options.apiSource,
			proxy: options.proxy,
			variables: apiConfig.variables,
			secrets: apiConfig.secrets,
		},
	};
}

export const spawnDevProcess = (
	config: DevProcess,
	callbacks: ProcessCallbacks,
	runtimeConfig?: RuntimeConfig,
) =>
	Effect.gen(function* () {
		let configDir: string;
		try {
			configDir = getProjectRoot();
		} catch {
			configDir = process.cwd();
		}
		const fullCwd = `${configDir}/${config.cwd}`;
		const readyDeferred = yield* Deferred.make<void>();
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

		// Spawn process using Bun.spawn (replaces @effect/platform Command)
		const proc = Bun.spawn({
			cmd: [config.command, ...config.args],
			cwd: fullCwd,
			env: envVars,
			stdio: ["inherit", "pipe", "pipe"],
		});

		// If the process exits before it ever reports ready, surface that.
		yield* Effect.fork(
			Effect.promise(() => proc.exited).pipe(
				Effect.andThen((code) =>
					Effect.gen(function* () {
						const currentStatus = yield* Ref.get(statusRef);
						if (currentStatus === "ready") return;
						callbacks.onLog(
							config.name,
							`Process exited before ready (exit code: ${code})`,
							true,
						);
						yield* Ref.set(statusRef, "error");
						callbacks.onStatus(config.name, "error");
						yield* Deferred.succeed(readyDeferred, undefined).pipe(
							Effect.ignore,
						);
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
					// Unblock orchestration when the process either becomes ready or fails.
					if (detected.status === "ready" || detected.status === "error") {
						yield* Deferred.succeed(readyDeferred, undefined).pipe(
							Effect.ignore,
						);
					}
				}
			});

		// Read stdout and stderr using raw stream readers (replaces Effect Stream)
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

interface ServerHandle {
	ready: Promise<void>;
	shutdown: () => Promise<void>;
}

interface ServerInput {
	config: RuntimeConfig;
}

const patchConsole = (
	name: string,
	callbacks: ProcessCallbacks,
): (() => void) => {
	const originalLog = console.log;
	const originalError = console.error;
	const originalWarn = console.warn;
	const originalInfo = console.info;

	const formatArgs = (args: unknown[]): string => {
		return args
			.map((arg) =>
				typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg),
			)
			.join(" ");
	};

	console.log = (...args: unknown[]) => {
		callbacks.onLog(name, formatArgs(args), false);
	};

	console.error = (...args: unknown[]) => {
		callbacks.onLog(name, formatArgs(args), true);
	};

	console.warn = (...args: unknown[]) => {
		callbacks.onLog(name, formatArgs(args), false);
	};

	console.info = (...args: unknown[]) => {
		callbacks.onLog(name, formatArgs(args), false);
	};

	return () => {
		console.log = originalLog;
		console.error = originalError;
		console.warn = originalWarn;
		console.info = originalInfo;
	};
};

export const spawnRemoteHost = (
	config: DevProcess,
	callbacks: ProcessCallbacks,
	runtimeConfig: RuntimeConfig,
) =>
	Effect.gen(function* () {
		const remoteUrl = config.env?.HOST_REMOTE_URL;

		if (!remoteUrl) {
			return yield* Effect.fail(
				new Error("HOST_REMOTE_URL not provided for remote host"),
			);
		}

		if (config.env) {
			for (const [key, value] of Object.entries(config.env)) {
				process.env[key] = value;
			}
		}

		callbacks.onStatus(config.name, "starting");

		callbacks.onLog(config.name, `Remote: ${remoteUrl}`);

		const restoreConsole = patchConsole(config.name, callbacks);

		callbacks.onLog(config.name, "Loading Module Federation runtime...");

		const mfRuntime = yield* Effect.tryPromise({
			try: () => import("@module-federation/enhanced/runtime"),
			catch: (e) => new Error(`Failed to load MF runtime: ${e}`),
		});

		const mfCore = yield* Effect.tryPromise({
			try: () => import("@module-federation/runtime-core"),
			catch: (e) => new Error(`Failed to load MF core: ${e}`),
		});

		let mf = mfRuntime.getInstance();
		if (!mf) {
			mf = mfRuntime.createInstance({ name: "cli-host", remotes: [] });
			mfCore.setGlobalFederationInstance(mf);
		}
		patchManifestFetchForSsrPublicPath(mf);

		const baseUrl = remoteUrl
			.replace(/\/remoteEntry\.js$/, "")
			.replace(/\/mf-manifest\.json$/, "")
			.replace(/\/$/, "");
		const remoteEntryUrl = `${baseUrl}/remoteEntry.js`;
		const manifestUrl = `${baseUrl}/mf-manifest.json`;

		const entryUrl = yield* Effect.tryPromise({
			try: async () => {
				try {
					const res = await fetch(manifestUrl);
					if (!res.ok) return remoteEntryUrl;
					const json = (await res.json()) as Record<string, unknown>;
					if (
						json &&
						typeof json === "object" &&
						"metaData" in json &&
						"exposes" in json &&
						"shared" in json
					) {
						return manifestUrl;
					}
				} catch {
					// ignore and fall back to remoteEntry.js
				}
				return remoteEntryUrl;
			},
			catch: () => remoteEntryUrl,
		});

		mf.registerRemotes([{ name: "host", entry: entryUrl }]);

		callbacks.onLog(config.name, `Loading host from ${entryUrl}...`);

		const hostModule = yield* Effect.tryPromise({
			try: () =>
				mf.loadRemote<{ runServer: (input: ServerInput) => ServerHandle }>(
					"host/Server",
				),
			catch: (e) => new Error(`Failed to load host module: ${e}`),
		});

		if (!hostModule?.runServer) {
			return yield* Effect.fail(
				new Error("Host module does not export runServer function"),
			);
		}

		callbacks.onLog(config.name, "Starting server...");
		const serverHandle = hostModule.runServer({ config: runtimeConfig });

		yield* Effect.tryPromise({
			try: () => serverHandle.ready,
			catch: (e) => new Error(`Server failed to start: ${e}`),
		});

		callbacks.onStatus(config.name, "ready");

		const handle: ProcessHandle = {
			name: config.name,
			pid: process.pid,
			kill: async () => {
				callbacks.onLog(config.name, "Shutting down remote host...");
				restoreConsole();
				await serverHandle.shutdown();
			},
			waitForReady: Effect.void,
			waitForExit: Effect.never,
		};

		return handle;
	});

export const makeDevProcess = (
	pkg: string,
	env: Record<string, string> | undefined,
	callbacks: ProcessCallbacks,
	portOverride?: number,
	bosConfig?: BosConfig,
) =>
	Effect.gen(function* () {
		const config = getProcessConfig(pkg, env, portOverride);
		if (!config) {
			return yield* Effect.fail(new Error(`Unknown package: ${pkg}`));
		}

		if (pkg === "host" && bosConfig) {
			const uiSource = (env?.UI_SOURCE as SourceMode) ?? "local";
			const apiSource = (env?.API_SOURCE as SourceMode) ?? "local";
			const apiProxy = env?.API_PROXY;

			let hostUrl = `http://localhost:${config.port}`;
			if (process.env.HOST_URL) {
				hostUrl = process.env.HOST_URL;
			}

			const runtimeConfig = buildRuntimeConfig(bosConfig, {
				uiSource,
				apiSource,
				hostUrl,
				proxy: apiProxy,
				env: "development",
			});

			if (env?.HOST_SOURCE === "remote") {
				return yield* spawnRemoteHost(config, callbacks, runtimeConfig);
			}

			return yield* spawnDevProcess(config, callbacks, runtimeConfig);
		}

		return yield* spawnDevProcess(config, callbacks);
	});

import { existsSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import { getProjectRoot, parsePort } from "./config";
import {
	makeDevProcess,
	type ProcessCallbacks,
	type ProcessHandle,
} from "./orchestrator";
import type { ProcessRegistry } from "./process-registry";
import type { BosConfig, RuntimeConfig } from "./types";

export interface AppOrchestrator {
	packages: string[];
	env: Record<string, string>;
	description: string;
	bosConfig: BosConfig;
	runtimeConfig: RuntimeConfig;
	port?: number;
	interactive?: boolean;
}

const STARTUP_ORDER = ["ui-ssr", "ui", "api", "host-build", "host"];

const sortByOrder = (packages: string[]): string[] => {
	return [...packages].sort((a, b) => {
		const aIdx = STARTUP_ORDER.indexOf(a);
		const bIdx = STARTUP_ORDER.indexOf(b);
		if (aIdx === -1 && bIdx === -1) return 0;
		if (aIdx === -1) return 1;
		if (bIdx === -1) return -1;
		return aIdx - bIdx;
	});
};

// Note: log filtering and persistence lives at the CLI layer.

export interface DevServersHandle {
	handles: ProcessHandle[];
	shutdown: Effect.Effect<void>;
}

export const startDevServers = (
	orchestrator: AppOrchestrator,
	callbacks: ProcessCallbacks,
	registry?: ProcessRegistry,
) =>
	Effect.gen(function* () {
		const orderedPackages = sortByOrder(orchestrator.packages);
		const handles: ProcessHandle[] = [];

		const shutdown = Effect.gen(function* () {
			const reversed = [...handles].reverse();
			for (const handle of reversed) {
				yield* Effect.tryPromise({
					try: () => handle.kill(),
					catch: () => null,
				}).pipe(Effect.ignore);
			}
		});

		const run = Effect.gen(function* () {
			for (const pkg of orderedPackages) {
				const portOverride = pkg === "host" ? orchestrator.port : undefined;
				const handle = yield* makeDevProcess(
					pkg,
					orchestrator.env,
					callbacks,
					portOverride,
					orchestrator.bosConfig,
					orchestrator.runtimeConfig,
					registry,
				);
				handles.push(handle);
			}

			return { handles, shutdown } satisfies DevServersHandle;
		});

		return yield* run.pipe(
			Effect.catchAllCause((cause) =>
				shutdown.pipe(Effect.andThen(Effect.failCause(cause))),
			),
		);
	});

export function detectLocalPackages(): string[] {
	const packages: string[] = [];
	const configDir = getProjectRoot();

	if (existsSync(join(configDir, "ui", "package.json"))) {
		packages.push("ui");
		packages.push("ui-ssr");
	}

	if (existsSync(join(configDir, "api", "package.json"))) {
		packages.push("api");
	}

	if (existsSync(join(configDir, "host", "package.json"))) {
		packages.push("host");
	}

	return packages;
}

export function buildRuntimeConfig(
	bosConfig: BosConfig,
	options: {
		uiSource?: "local" | "remote";
		apiSource?: "local" | "remote";
		hostUrl: string;
		env?: "development" | "production";
	},
): RuntimeConfig {
	const uiConfig = bosConfig.app.ui;
	const apiConfig = bosConfig.app.api;
	const uiSource = options.uiSource ?? "local";
	const apiSource = options.apiSource ?? "local";

	return {
		env: options.env ?? "development",
		account: bosConfig.account,
		hostUrl: options.hostUrl,
		shared: bosConfig.shared,
		ui: uiConfig
			? {
					name: uiConfig.name,
					url:
						uiSource === "remote"
							? (uiConfig.production ?? "")
							: (uiConfig.development ?? ""),
					entry: `${uiSource === "remote" ? uiConfig.production : uiConfig.development}/mf-manifest.json`,
					ssrUrl:
						uiSource === "remote"
							? uiConfig.ssr
							: `http://localhost:${parsePort(uiConfig.development ?? "http://localhost:3002") + 1}`,
					source: uiSource,
				}
			: undefined,
		api: apiConfig
			? {
					name: apiConfig.name,
					url:
						apiSource === "remote"
							? (apiConfig.production ?? "")
							: (apiConfig.development ?? ""),
					entry: `${apiSource === "remote" ? apiConfig.production : apiConfig.development}/mf-manifest.json`,
					source: apiSource,
					variables: apiConfig.variables,
					secrets: apiConfig.secrets,
				}
			: undefined,
	};
}

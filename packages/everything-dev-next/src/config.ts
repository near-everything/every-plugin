import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BosConfig, RuntimeConfig } from "./types";
import { BosConfigSchema } from "./types";

let cachedConfig: BosConfig | null = null;
let projectRoot: string | null = null;

export function clearConfigCache(): void {
	cachedConfig = null;
	projectRoot = null;
}

export function findConfigPath(cwd?: string): string | null {
	let dir = cwd ?? process.cwd();
	while (dir !== "/") {
		const configPath = join(dir, "bos.config.json");
		if (existsSync(configPath)) {
			return configPath;
		}
		dir = dirname(dir);
	}
	return null;
}

export function getConfig(): BosConfig | null {
	return cachedConfig;
}

export function getProjectRoot(): string {
	if (!projectRoot) {
		throw new Error("Config not loaded. Call loadConfig() first.");
	}
	return projectRoot;
}

export interface ConfigResult {
	config: BosConfig;
	runtime: RuntimeConfig;
	source: {
		path: string;
		extended?: string[];
		remote?: boolean;
	};
}

export async function loadConfig(options?: {
	cwd?: string;
	path?: string;
	env?: "development" | "production";
}): Promise<ConfigResult | null> {
	const configPath = options?.path ?? findConfigPath(options?.cwd);
	if (!configPath) {
		projectRoot = options?.cwd ?? process.cwd();
		return null;
	}

	const baseDir = dirname(configPath);

	try {
		const raw = readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(raw);
		const config = BosConfigSchema.parse(parsed);

		cachedConfig = config;
		projectRoot = baseDir;

		const runtime = buildRuntimeConfig(config, options?.env ?? "development");

		return {
			config,
			runtime,
			source: { path: configPath },
		};
	} catch (error) {
		throw new Error(`Failed to load config from ${configPath}: ${error}`);
	}
}

function buildRuntimeConfig(
	config: BosConfig,
	env: "development" | "production",
): RuntimeConfig {
	const uiConfig = config.app.ui;
	const apiConfig = config.app.api;

	return {
		env,
		account: config.account,
		hostUrl: config.app.host[env],
		shared: config.shared,
		ui: uiConfig
			? {
					name: uiConfig.name,
					url: uiConfig[env] ?? "",
					entry: `${uiConfig[env] ?? ""}/mf-manifest.json`,
					ssrUrl: uiConfig.ssr,
					source: env === "development" ? "local" : "remote",
				}
			: undefined,
		api: apiConfig
			? {
					name: apiConfig.name,
					url: apiConfig[env] ?? "",
					entry: `${apiConfig[env] ?? ""}/mf-manifest.json`,
					source: env === "development" ? "local" : "remote",
					variables: apiConfig.variables,
					secrets: apiConfig.secrets,
				}
			: undefined,
	};
}

export function parsePort(url: string): number {
	try {
		const parsed = new URL(url);
		return parsed.port
			? parseInt(parsed.port, 10)
			: parsed.protocol === "https:"
				? 443
				: 80;
	} catch {
		return 3000;
	}
}

export type { BosConfig, ConfigResult, RuntimeConfig } from "./types";
export { BosConfigSchema } from "./types";

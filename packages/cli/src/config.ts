import { existsSync, statSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
	AppConfig,
	BosConfig,
	GatewayConfig,
	HostConfig,
	PortConfig,
	RemoteConfig,
	RuntimeConfig,
	SourceMode,
} from "./types";

export type {
	AppConfig,
	BosConfig,
	GatewayConfig,
	HostConfig,
	PortConfig,
	RemoteConfig,
	RuntimeConfig,
	SourceMode
};

export const DEFAULT_DEV_CONFIG: AppConfig = {
	host: "local",
	ui: "local",
	api: "local",
};

let cachedConfig: BosConfig | null = null;
let configDir: string | null = null;
let configLoaded = false;

export function findConfigPath(startDir: string): string | null {
	let dir = startDir;
	while (dir !== "/") {
		const configPath = join(dir, "bos.config.json");
		if (existsSync(configPath) && statSync(configPath).size > 0) {
			return configPath;
		}
		dir = dirname(dir);
	}
	return null;
}

function findConfigPathSync(startDir: string): string | null {
	let dir = startDir;
	while (dir !== "/") {
		const configPath = join(dir, "bos.config.json");
		if (existsSync(configPath) && statSync(configPath).size > 0) {
			return configPath;
		}
		dir = dirname(dir);
	}
	return null;
}

export function loadConfig(cwd?: string): BosConfig | null {
	if (configLoaded) return cachedConfig;

	const startDir = cwd ?? process.cwd();
	const configPath = findConfigPathSync(startDir);

	if (!configPath) {
		configLoaded = true;
		configDir = startDir;
		return null;
	}

	configDir = dirname(configPath);
	const content = require(configPath);
	cachedConfig = content as BosConfig;
	configLoaded = true;
	return cachedConfig;
}

export function setConfig(config: BosConfig, dir?: string): void {
	cachedConfig = config;
	configDir = dir ?? process.cwd();
	configLoaded = true;
}

export function getConfigDir(): string {
	if (!configLoaded) {
		loadConfig();
	}
	return configDir!;
}

export function getRemotes(): string[] {
	const config = loadConfig();
	if (!config) return [];
	return Object.keys(config.app).filter((k) => k !== "host");
}

export function getPackages(): string[] {
	const config = loadConfig();
	if (!config) return [];
	return Object.keys(config.app);
}

export function getRemote(name: string): RemoteConfig | undefined {
	const config = loadConfig();
	if (!config) return undefined;
	const remote = config.app[name];
	if (remote && "name" in remote) {
		return remote as RemoteConfig;
	}
	return undefined;
}

export function getHost(): HostConfig {
	const config = loadConfig();
	if (!config) {
		throw new Error("No bos.config.json found");
	}
	return config.app.host;
}

export function getUrl(
	packageName: string,
	env: "development" | "production" = "development",
): string | undefined {
	const config = loadConfig();
	if (!config) return undefined;
	const pkg = config.app[packageName];
	if (!pkg) return undefined;
	return pkg[env];
}

export function getAccount(): string {
	const config = loadConfig();
	if (!config) {
		throw new Error("No bos.config.json found");
	}
	return config.account;
}

export function getComponentUrl(
	component: "host" | "ui" | "api",
	source: SourceMode,
): string {
	const config = loadConfig();
	if (!config) {
		throw new Error("No bos.config.json found");
	}

	if (component === "host") {
		return source === "remote"
			? config.app.host.production
			: config.app.host.development;
	}

	const componentConfig = config.app[component];
	if (!componentConfig || !("name" in componentConfig)) {
		throw new Error(`Component ${component} not found in bos.config.json`);
	}

	return source === "remote"
		? componentConfig.production
		: componentConfig.development;
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

export function getPortsFromConfig(): PortConfig {
	const config = loadConfig();
	if (!config) {
		return { host: 3000, ui: 3002, api: 3014 };
	}
	return {
		host: parsePort(config.app.host.development),
		ui: config.app.ui
			? parsePort((config.app.ui as RemoteConfig).development)
			: 3002,
		api: config.app.api
			? parsePort((config.app.api as RemoteConfig).development)
			: 3014,
	};
}

export function getConfigPath(): string {
	if (!configDir) {
		loadConfig();
	}
	return `${configDir}/bos.config.json`;
}

export function getHostRemoteUrl(): string | undefined {
	const config = loadConfig();
	if (!config) return undefined;
	return config.app.host.production || undefined;
}

export function getGatewayUrl(
	env: "development" | "production" = "development",
): string {
	const config = loadConfig();
	if (!config) {
		throw new Error("No bos.config.json found");
	}
	return config.gateway[env];
}

async function fileExists(path: string): Promise<boolean> {
	return access(path)
		.then(() => true)
		.catch(() => false);
}

export async function packageExists(pkg: string): Promise<boolean> {
	const dir = getConfigDir();
	return fileExists(`${dir}/${pkg}/package.json`);
}

export async function resolvePackageModes(
	packages: string[],
	input: Record<string, SourceMode | undefined>,
): Promise<{ modes: Record<string, SourceMode>; autoRemote: string[] }> {
	const dir = getConfigDir();
	const modes: Record<string, SourceMode> = {};
	const autoRemote: string[] = [];

	for (const pkg of packages) {
		const exists = await fileExists(`${dir}/${pkg}/package.json`);
		const requestedMode = input[pkg] ?? "local";

		if (!exists && requestedMode === "local") {
			modes[pkg] = "remote";
			autoRemote.push(pkg);
		} else {
			modes[pkg] = requestedMode;
		}
	}

	return { modes, autoRemote };
}

export async function getExistingPackages(
	packages: string[],
): Promise<{ existing: string[]; missing: string[] }> {
	const dir = getConfigDir();
	const existing: string[] = [];
	const missing: string[] = [];

	for (const pkg of packages) {
		const exists = await fileExists(`${dir}/${pkg}/package.json`);
		if (exists) {
			existing.push(pkg);
		} else {
			missing.push(pkg);
		}
	}

	return { existing, missing };
}

export async function loadBosConfig(
	env: "development" | "production" = "production",
): Promise<RuntimeConfig> {
	const configPath = process.env.BOS_CONFIG_PATH;

	let bosConfig: BosConfig;
	if (configPath) {
		const text = await readFile(configPath, "utf-8");
		bosConfig = JSON.parse(text) as BosConfig;
	} else {
		const config = loadConfig();
		if (!config) {
			throw new Error("No bos.config.json found");
		}
		bosConfig = config;
	}

	const uiConfig = bosConfig.app.ui as RemoteConfig;
	const apiConfig = bosConfig.app.api as RemoteConfig;

	// Test/dev overrides (useful for pointing MF SSR to a local server).
	// These are intentionally simple string overrides so test harnesses can
	// stand up a local static server and redirect the remotes without editing
	// bos.config.json.
	const uiUrlOverride = process.env.BOS_UI_URL;
	const uiSsrUrlOverride = process.env.BOS_UI_SSR_URL;

	return {
		env,
		account: bosConfig.account,
		title: bosConfig.account,
		hostUrl: bosConfig.app.host[env],
		shared: bosConfig.shared,
		ui: {
			name: uiConfig.name,
			url: uiUrlOverride ?? uiConfig[env],
			ssrUrl: uiSsrUrlOverride ?? uiConfig.ssr,
			source: "remote",
		},
		api: {
			name: apiConfig.name,
			url: apiConfig[env],
			source: "remote",
			proxy: apiConfig.proxy,
			variables: apiConfig.variables,
			secrets: apiConfig.secrets,
		},
	};
}

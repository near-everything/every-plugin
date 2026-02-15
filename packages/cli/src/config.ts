import { existsSync, statSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { Effect } from "every-plugin/effect";
import { Graph } from "near-social-js";
import type {
	AppConfig,
	BosConfig,
	BosConfigInput,
	PortConfig,
	RemoteConfig,
	RuntimeConfig,
	SourceMode,
} from "./types";
import {
	BosConfigInputSchema,
	BosConfigSchema,
	ConfigCircularExtendsError,
	ConfigFetchError,
	ConfigResolutionError,
} from "./types";

// Re-export types
export type {
	AppConfig,
	BosConfig,
	PortConfig,
	RemoteConfig,
	RuntimeConfig,
	SourceMode,
};

// Constants
export const DEFAULT_DEV_CONFIG: AppConfig = {
	host: "local",
	ui: "local",
	api: "local",
};

// Global state (for caching)
const configCache = new Map<string, { config: BosConfig; timestamp: number }>();
let cachedConfig: BosConfig | null = null;
let projectRoot: string | null = null;
let configLoaded = false;

// ============================================================================
// PUBLIC API (6 methods)
// ============================================================================

/**
 * Clear the config cache. Used by --force flag.
 */
export function clearConfigCache(): void {
	configCache.clear();
	cachedConfig = null;
	projectRoot = null;
	configLoaded = false;
}

/**
 * Find the path to bos.config.json by walking up the directory tree.
 */
export function findConfigPath(cwd?: string): string | null {
	let dir = cwd ?? process.cwd();
	while (dir !== "/") {
		const configPath = join(dir, "bos.config.json");
		if (existsSync(configPath) && statSync(configPath).size > 0) {
			return configPath;
		}
		dir = dirname(dir);
	}
	return null;
}

/**
 * Get the cached config. Returns null if not loaded yet.
 */
export function getConfig(): BosConfig | null {
	return cachedConfig;
}

/**
 * Get the project root directory (where bos.config.json is located).
 * Throws if config hasn't been loaded.
 */
export function getProjectRoot(): string {
	if (!configLoaded || !projectRoot) {
		throw new Error("Config not loaded. Call loadConfig() first.");
	}
	return projectRoot;
}

/**
 * Result of loading config - includes everything needed by callers.
 */
export interface ConfigResult {
	/** The validated BosConfig */
	config: BosConfig;
	/** Environment-specific runtime config */
	runtime: RuntimeConfig;
	/** Information about where/how the config was loaded */
	source: {
		path: string;
		extended?: string[];
		remote?: boolean;
	};
	/** Package information */
	packages: {
		all: string[];
		resolved: PackageResolution[];
	};
}

/**
 * Resolution info for a single package.
 */
export interface PackageResolution {
	name: string;
	mode: SourceMode;
	exists: boolean;
	port: number;
	url: string;
}

/**
 * Primary config loader - handles everything.
 * - Local config loading
 * - Config inheritance (extends)
 * - BOS URL fetching
 * - Caching
 * - Runtime config generation
 */
export async function loadConfig(options?: {
	cwd?: string;
	path?: string;
	force?: boolean;
	env?: "development" | "production";
}): Promise<ConfigResult | null> {
	// Return cached result if available and not forcing reload
	if (configLoaded && cachedConfig && !options?.force) {
		const runtime = buildRuntimeConfig(
			cachedConfig,
			options?.env ?? "development",
		);
		return {
			config: cachedConfig,
			runtime,
			source: { path: join(projectRoot!, "bos.config.json") },
			packages: {
				all: Object.keys(cachedConfig.app),
				resolved: [], // Will be populated by resolvePackages
			},
		};
	}

	// Find or use explicit config path
	const configPath = options?.path ?? findConfigPath(options?.cwd);
	if (!configPath) {
		configLoaded = true;
		projectRoot = options?.cwd ?? process.cwd();
		return null;
	}

	const baseDir = dirname(configPath);

	// Check cache for this specific file
	const cached = configCache.get(configPath);
	if (cached && !options?.force) {
		projectRoot = baseDir;
		cachedConfig = cached.config;
		configLoaded = true;
		const runtime = buildRuntimeConfig(
			cached.config,
			options?.env ?? "development",
		);
		return {
			config: cached.config,
			runtime,
			source: { path: configPath },
			packages: {
				all: Object.keys(cached.config.app),
				resolved: [],
			},
		};
	}

	try {
		// Resolve config with extends
		const extendedChain: string[] = [];
		const rawConfig = await resolveConfigWithExtends(
			configPath,
			baseDir,
			new Set(),
			extendedChain,
		);

		// Validate with strict schema
		const validated = BosConfigSchema.parse(rawConfig);

		// Cache result
		configCache.set(configPath, { config: validated, timestamp: Date.now() });
		projectRoot = baseDir;
		cachedConfig = validated;
		configLoaded = true;

		// Build runtime config
		const runtime = buildRuntimeConfig(
			validated,
			options?.env ?? "development",
		);

		return {
			config: validated,
			runtime,
			source: {
				path: configPath,
				extended: extendedChain.length > 0 ? extendedChain : undefined,
				remote: extendedChain.some((e) => e.startsWith("bos://")),
			},
			packages: {
				all: Object.keys(validated.app),
				resolved: [],
			},
		};
	} catch (error) {
		if (error instanceof ConfigCircularExtendsError) {
			throw error;
		}
		if (error instanceof ConfigFetchError) {
			throw error;
		}
		if (error instanceof ConfigResolutionError) {
			throw error;
		}
		throw new ConfigResolutionError(
			`Failed to load config from ${configPath}: ${error}`,
		);
	}
}

/**
 * Resolve packages with modes, existence checks, and auto-remote detection.
 * Merges functionality of resolvePackageModes() and getExistingPackages().
 */
export async function resolvePackages(
	packages: string[],
	requestedModes: Record<string, SourceMode>,
): Promise<{
	resolved: Record<string, PackageResolution>;
	autoRemote: string[];
}> {
	const dir = getProjectRoot();
	const resolved: Record<string, PackageResolution> = {};
	const autoRemote: string[] = [];

	// Get config for port calculations
	const config = getConfig();

	for (const pkg of packages) {
		const exists = await fileExists(`${dir}/${pkg}/package.json`);
		const requestedMode = requestedModes[pkg] ?? "local";

		// Auto-switch to remote if package doesn't exist locally
		const mode =
			!exists && requestedMode === "local" ? "remote" : requestedMode;
		if (!exists && requestedMode === "local") {
			autoRemote.push(pkg);
		}

		// Calculate port and URL
		let port = 0;
		let url = "";

		if (config && pkg in config.app) {
			const pkgConfig = config.app[pkg];
			if (pkg === "host") {
				port = parsePort(pkgConfig.development);
				url = mode === "remote" ? pkgConfig.production : pkgConfig.development;
			} else {
				// For ui/api and other packages, access via index signature
				const devUrl = (pkgConfig as { development?: string }).development;
				const prodUrl = (pkgConfig as { production?: string }).production;
				if (devUrl) {
					port = parsePort(devUrl);
					url = mode === "remote" ? (prodUrl ?? devUrl) : devUrl;
				}
			}
		}

		resolved[pkg] = { name: pkg, mode, exists, port, url };
	}

	return { resolved, autoRemote };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Parse port from URL string.
 */
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

/**
 * Check if a file exists.
 */
async function fileExists(path: string): Promise<boolean> {
	return access(path)
		.then(() => true)
		.catch(() => false);
}

/**
 * Resolve BOS URL to Graph path.
 * bos://{account}/{gateway} → {account}/bos/gateways/{gateway}/bos.config.json
 */
function resolveBosUrl(bosUrl: string): string {
	const match = bosUrl.match(/^bos:\/\/([^/]+)\/(.+)$/);
	if (!match) {
		throw new ConfigResolutionError(
			`Invalid BOS URL format: ${bosUrl}. Expected: bos://{account}/{gateway}`,
		);
	}
	const [, account, gateway] = match;
	return `${account}/bos/gateways/${gateway}/bos.config.json`;
}

/**
 * Fetch config from NEAR Social (BOS URL) with 10s timeout.
 */
async function fetchBosConfig(bosUrl: string): Promise<BosConfigInput> {
	const configPath = resolveBosUrl(bosUrl);
	const graph = new Graph();

	try {
		const data = await Effect.runPromise(
			Effect.tryPromise({
				try: () =>
					Promise.race([
						graph.get({ keys: [configPath] }),
						new Promise<never>((_, reject) =>
							setTimeout(() => reject(new Error("Timeout after 10s")), 10000),
						),
					]),
				catch: (e) => new ConfigFetchError(bosUrl, e),
			}),
		);

		if (!data) {
			throw new ConfigFetchError(bosUrl, "No data returned");
		}

		// Navigate nested structure
		const parts = configPath.split("/");
		let current: unknown = data;
		for (const part of parts) {
			if (current && typeof current === "object" && part in current) {
				current = (current as Record<string, unknown>)[part];
			} else {
				throw new ConfigFetchError(bosUrl, `Path not found: ${configPath}`);
			}
		}

		if (typeof current !== "string") {
			throw new ConfigFetchError(bosUrl, "Config is not a string");
		}

		return JSON.parse(current) as BosConfigInput;
	} catch (error) {
		if (error instanceof ConfigFetchError) {
			throw error;
		}
		throw new ConfigFetchError(bosUrl, error);
	}
}

/**
 * Load a single config file (local or BOS URL).
 */
async function loadConfigFile(
	configPath: string,
	baseDir?: string,
): Promise<BosConfigInput> {
	// BOS URL
	if (configPath.startsWith("bos://")) {
		return fetchBosConfig(configPath);
	}

	// Local file
	const resolvedPath = isAbsolute(configPath)
		? configPath
		: baseDir
			? resolve(baseDir, configPath)
			: resolve(process.cwd(), configPath);

	const text = await readFile(resolvedPath, "utf-8");
	return JSON.parse(text) as BosConfigInput;
}

/**
 * Deep merge configs with inheritance.
 * - Objects: recursive merge
 * - Arrays: child replaces parent
 * - Primitives: child wins
 */
function mergeConfigs(
	parent: BosConfigInput,
	child: BosConfigInput,
): BosConfigInput {
	const merged: BosConfigInput = { ...parent, ...child };

	// Merge app configs deeply
	if (parent.app || child.app) {
		merged.app = { ...parent.app, ...child.app };
		const parentApps = parent.app || {};
		const childApps = child.app || {};

		for (const key of new Set([
			...Object.keys(parentApps),
			...Object.keys(childApps),
		])) {
			const parentApp = parentApps[key as keyof typeof parentApps];
			const childApp = childApps[key as keyof typeof childApps];

			if (parentApp && childApp) {
				(merged.app as Record<string, unknown>)[key] = {
					...parentApp,
					...childApp,
				};
			} else if (childApp) {
				(merged.app as Record<string, unknown>)[key] = childApp;
			} else if (parentApp) {
				(merged.app as Record<string, unknown>)[key] = parentApp;
			}
		}
	}

	// Merge shared deps deeply
	if (parent.shared || child.shared) {
		merged.shared = { ...parent.shared, ...child.shared };
		const parentShared = parent.shared || {};
		const childShared = child.shared || {};

		// Deep merge each shared category (ui, api, etc.)
		for (const category of new Set([
			...Object.keys(parentShared),
			...Object.keys(childShared),
		])) {
			const parentCategory =
				parentShared[category as keyof typeof parentShared];
			const childCategory = childShared[category as keyof typeof childShared];

			if (parentCategory && childCategory) {
				(merged.shared as Record<string, unknown>)[category] = {
					...parentCategory,
					...childCategory,
				};
			} else if (childCategory) {
				(merged.shared as Record<string, unknown>)[category] = childCategory;
			} else if (parentCategory) {
				(merged.shared as Record<string, unknown>)[category] = parentCategory;
			}
		}
	}

	return merged;
}

/**
 * Recursively resolve config with extends inheritance.
 */
async function resolveConfigWithExtends(
	configPath: string,
	baseDir: string,
	visited: Set<string>,
	chain: string[],
): Promise<BosConfigInput> {
	// Check for circular dependencies
	if (visited.has(configPath)) {
		throw new ConfigCircularExtendsError([...visited, configPath]);
	}

	// Load current config
	const config = await loadConfigFile(configPath, baseDir);

	// Track in chain if it's a BOS URL
	if (configPath.startsWith("bos://")) {
		chain.push(configPath);
	}

	// If no extends, return as-is
	if (!config.extends) {
		return config;
	}

	// Mark as visited
	const newVisited = new Set(visited);
	newVisited.add(configPath);

	// Resolve parent
	const parentPath = config.extends;
	const parentBaseDir = parentPath.startsWith("bos://")
		? baseDir
		: isAbsolute(parentPath)
			? dirname(parentPath)
			: baseDir;

	const parentConfig = await resolveConfigWithExtends(
		parentPath,
		parentBaseDir,
		newVisited,
		chain,
	);

	// Merge and return
	return mergeConfigs(parentConfig, config);
}

/**
 * Build runtime config from BosConfig.
 */
function buildRuntimeConfig(
	config: BosConfig,
	env: "development" | "production",
): RuntimeConfig {
	const uiConfig = config.app.ui as RemoteConfig | undefined;
	const apiConfig = config.app.api as RemoteConfig | undefined;

	// Extract properties from api config
	const apiProxy = apiConfig?.proxy;
	const apiVariables = apiConfig?.variables;
	const apiSecrets = apiConfig?.secrets;

	// Env var overrides
	const uiUrlOverride = process.env.BOS_UI_URL;
	const uiSsrUrlOverride = process.env.BOS_UI_SSR_URL;

	return {
		env,
		account: config.account,
		title: config.account,
		hostUrl: config.app.host[env],
		shared: config.shared,
		ui: {
			name: uiConfig?.name ?? "ui",
			url: uiUrlOverride ?? uiConfig?.[env] ?? "",
			entry: `${uiUrlOverride ?? uiConfig?.[env] ?? ""}/remoteEntry.js`,
			ssrUrl: uiSsrUrlOverride ?? uiConfig?.ssr,
			source: env === "development" ? "local" : "remote",
		},
		api: {
			name: apiConfig?.name ?? "api",
			url: apiConfig?.[env] ?? "",
			entry: `${apiConfig?.[env] ?? ""}/remoteEntry.js`,
			source: env === "development" ? "local" : "remote",
			proxy: apiProxy,
			variables: apiVariables,
			secrets: apiSecrets,
		},
	};
}

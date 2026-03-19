import { z } from "every-plugin/zod";

export const SourceModeSchema = z.enum(["local", "remote"]);
export type SourceMode = z.infer<typeof SourceModeSchema>;

export const HostConfigSchema = z.object({
	development: z.string(),
	production: z.string(),
	secrets: z.array(z.string()).optional(),
	template: z.string().optional(),
	files: z.array(z.string()).optional(),
	sync: z.lazy(() => SyncConfigSchema).optional(),
});
export type HostConfig = z.infer<typeof HostConfigSchema>;

export const RemoteConfigSchema = z.object({
	name: z.string(),
	development: z.string(),
	production: z.string(),
	ssr: z.string().optional(),
	proxy: z.string().optional(),
	variables: z.record(z.string(), z.string()).optional(),
	secrets: z.array(z.string()).optional(),
	template: z.string().optional(),
	files: z.array(z.string()).optional(),
	sync: z.lazy(() => SyncConfigSchema).optional(),
});
export type RemoteConfig = z.infer<typeof RemoteConfigSchema>;

/**
 * Partial RemoteConfig for input configs (child configs that extend a base).
 * Only 'name' is required; development/production can be inherited.
 */
export const PartialRemoteConfigSchema = z.object({
	name: z.string(),
	development: z.string().optional(),
	production: z.string().optional(),
	proxy: z.string().optional(),
	variables: z.record(z.string(), z.string()).optional(),
	secrets: z.array(z.string()).optional(),
	template: z.string().optional(),
	files: z.array(z.string()).optional(),
	sync: z.lazy(() => SyncConfigSchema).optional(),
});
export type PartialRemoteConfig = z.infer<typeof PartialRemoteConfigSchema>;

export const NovaConfigSchema = z.object({
	account: z.string(),
});
export type NovaConfig = z.infer<typeof NovaConfigSchema>;

export const GatewayConfigSchema = z.object({
	development: z.string(),
	production: z.string(),
	account: z.string().optional(),
	nova: NovaConfigSchema.optional(),
});
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

export const SharedDepConfigSchema = z.object({
	version: z.string().describe("Exact installed version"),
	requiredVersion: z.string().optional(),
	singleton: z.boolean().optional(),
	eager: z.boolean().optional(),
	strictVersion: z.boolean().optional(),
	shareScope: z.string().optional(),
});
export type SharedDepConfig = z.infer<typeof SharedDepConfigSchema>;

// Input schema is permissive to support migrations.
export const SharedDepConfigInputSchema = z.object({
	version: z.string().optional(),
	requiredVersion: z.string().optional(),
	singleton: z.boolean().optional(),
	eager: z.boolean().optional(),
	strictVersion: z.boolean().optional(),
	shareScope: z.string().optional(),
});
export type SharedDepConfigInput = z.infer<typeof SharedDepConfigInputSchema>;

export const SyncConfigSchema = z.object({
	scripts: z.union([z.array(z.string()), z.literal(true)]).optional(),
	dependencies: z.boolean().default(true),
	devDependencies: z.boolean().default(true),
});
export type SyncConfig = z.infer<typeof SyncConfigSchema>;

export const BosConfigSchema = z.object({
	extends: z.string().optional(),
	account: z.string(),
	testnet: z.string().optional(),
	nova: NovaConfigSchema.optional(),
	gateway: GatewayConfigSchema,
	template: z.string().optional(),
	cli: z
		.object({
			version: z.string().optional(),
		})
		.optional(),
	shared: z
		.record(z.string(), z.record(z.string(), SharedDepConfigSchema))
		.optional(),
	app: z
		.object({
			host: HostConfigSchema,
		})
		.catchall(z.union([RemoteConfigSchema, HostConfigSchema])),
});
export type BosConfig = z.infer<typeof BosConfigSchema>;

/**
 * BosConfigInputSchema - permissive schema for parsing input configs.
 * Supports extends and allows partial app configs (child overrides only what it needs).
 * After resolving extends, the result must be validated against the strict BosConfigSchema.
 */
export const BosConfigInputSchema = z.object({
	extends: z.string().optional(),
	account: z.string().optional(),
	testnet: z.string().optional(),
	nova: NovaConfigSchema.optional(),
	gateway: GatewayConfigSchema.optional(),
	template: z.string().optional(),
	cli: z
		.object({
			version: z.string().optional(),
		})
		.optional(),
	shared: z
		.record(z.string(), z.record(z.string(), SharedDepConfigInputSchema))
		.optional(),
	app: z
		.object({
			host: HostConfigSchema.optional(),
			ui: PartialRemoteConfigSchema.optional(),
			api: PartialRemoteConfigSchema.optional(),
		})
		.partial()
		.catchall(z.union([HostConfigSchema, PartialRemoteConfigSchema])),
});
export type BosConfigInput = z.infer<typeof BosConfigInputSchema>;

export const AppConfigSchema = z.object({
	host: SourceModeSchema,
	ui: SourceModeSchema,
	api: SourceModeSchema,
	proxy: z.boolean().optional(),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

export const PortConfigSchema = z.object({
	host: z.number(),
	ui: z.number(),
	api: z.number(),
});
export type PortConfig = z.infer<typeof PortConfigSchema>;

export const SharedConfigSchema = z.object({
	version: z.string(),
	requiredVersion: z.string().optional(),
	singleton: z.boolean().optional(),
	eager: z.boolean().optional(),
	strictVersion: z.boolean().optional(),
	shareScope: z.string().optional(),
});
export type SharedConfig = z.infer<typeof SharedConfigSchema>;

/**
 * Federation entry info - both base URL and computed manifest entry
 */
export const FederationEntrySchema = z.object({
	name: z.string(),
	url: z.string(), // Base/assets URL
	entry: z.string(), // Computed federation entry (mf-manifest.json or remoteEntry.js)
	source: SourceModeSchema,
});
export type FederationEntry = z.infer<typeof FederationEntrySchema>;

export const RuntimeConfigSchema = z.object({
	env: z.enum(["development", "production"]),
	account: z.string(),
	title: z.string().optional(),
	hostUrl: z.string(),
	shared: z
		.object({
			ui: z.record(z.string(), SharedConfigSchema).optional(),
		})
		.optional(),
	ui: FederationEntrySchema.extend({
		ssrUrl: z.string().optional(),
	}),
	api: FederationEntrySchema.extend({
		proxy: z.string().optional(),
		variables: z.record(z.string(), z.string()).optional(),
		secrets: z.array(z.string()).optional(),
	}),
});
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

/**
 * Client-side runtime config (injected via window.__RUNTIME_CONFIG__)
 * Contains federation entry info so browser can load remotes via manifest
 */
export const ClientRuntimeConfigSchema = z.object({
	env: z.enum(["development", "production"]),
	account: z.string(),
	hostUrl: z.string().optional(),
	assetsUrl: z.string(), // Legacy: use ui.entry for MF loading
	apiBase: z.string(),
	rpcBase: z.string(),
	ui: z
		.object({
			name: z.string(),
			url: z.string(), // Base URL for assets
			entry: z.string(), // Federation entry (mf-manifest.json)
		})
		.optional(),
});
export type ClientRuntimeConfig = z.infer<typeof ClientRuntimeConfigSchema>;

/**
 * Error thrown when a circular extends dependency is detected
 */
export class ConfigCircularExtendsError extends Error {
	constructor(chain: string[]) {
		super(`Circular extends detected: ${chain.join(" → ")}`);
		this.name = "ConfigCircularExtendsError";
	}
}

/**
 * Error thrown when config fetching fails
 */
export class ConfigFetchError extends Error {
	constructor(url: string, cause: unknown) {
		super(`Failed to fetch config from ${url}: ${cause}`);
		this.name = "ConfigFetchError";
	}
}

/**
 * Error thrown when config resolution fails
 */
export class ConfigResolutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigResolutionError";
	}
}

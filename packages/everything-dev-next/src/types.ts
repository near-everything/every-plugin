import { z } from "zod";

export const SourceModeSchema = z.enum(["local", "remote"]);
export type SourceMode = z.infer<typeof SourceModeSchema>;

export const SharedDepConfigSchema = z.object({
	version: z.string(),
	requiredVersion: z.string().optional(),
	singleton: z.boolean().optional(),
	eager: z.boolean().optional(),
	strictVersion: z.boolean().optional(),
	shareScope: z.string().optional(),
});
export type SharedDepConfig = z.infer<typeof SharedDepConfigSchema>;

export const FederationEntrySchema = z.object({
	name: z.string(),
	url: z.string(),
	entry: z.string(),
	source: SourceModeSchema,
});
export type FederationEntry = z.infer<typeof FederationEntrySchema>;

export const ApiPluginConfigSchema = z.object({
	name: z.string(),
	development: z.string().optional(),
	production: z.string().optional(),
	variables: z.record(z.string(), z.string()).optional(),
	secrets: z.array(z.string()).optional(),
});
export type ApiPluginConfig = z.infer<typeof ApiPluginConfigSchema>;

export const UiConfigSchema = z.object({
	name: z.string(),
	development: z.string().optional(),
	production: z.string().optional(),
	ssr: z.string().optional(),
});
export type UiConfig = z.infer<typeof UiConfigSchema>;

export const HostConfigSchema = z.object({
	development: z.string(),
	production: z.string(),
	secrets: z.array(z.string()).optional(),
});
export type HostConfig = z.infer<typeof HostConfigSchema>;

export const BosConfigSchema = z.object({
	account: z.string(),
	extends: z.string().optional(),
	shared: z
		.record(z.string(), z.record(z.string(), SharedDepConfigSchema))
		.optional(),
	app: z.object({
		host: HostConfigSchema,
		ui: UiConfigSchema.optional(),
		api: ApiPluginConfigSchema.optional(),
	}),
});
export type BosConfig = z.infer<typeof BosConfigSchema>;

export const RuntimeConfigSchema = z.object({
	env: z.enum(["development", "production"]),
	account: z.string(),
	hostUrl: z.string(),
	shared: z
		.object({
			ui: z.record(z.string(), SharedDepConfigSchema).optional(),
		})
		.optional(),
	ui: FederationEntrySchema.extend({
		ssrUrl: z.string().optional(),
	}).optional(),
	api: FederationEntrySchema.extend({
		variables: z.record(z.string(), z.string()).optional(),
		secrets: z.array(z.string()).optional(),
	}).optional(),
});
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export const ClientRuntimeConfigSchema = z.object({
	env: z.enum(["development", "production"]),
	account: z.string(),
	hostUrl: z.string().optional(),
	ui: z
		.object({
			name: z.string(),
			url: z.string(),
			entry: z.string(),
		})
		.optional(),
	api: z
		.object({
			name: z.string(),
			url: z.string(),
			entry: z.string(),
		})
		.optional(),
});
export type ClientRuntimeConfig = z.infer<typeof ClientRuntimeConfigSchema>;

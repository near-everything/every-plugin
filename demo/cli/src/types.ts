import { z } from "every-plugin/zod";

export const SourceModeSchema = z.enum(["local", "remote"]);
export type SourceMode = z.infer<typeof SourceModeSchema>;

export const HostConfigSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  development: z.string(),
  production: z.string(),
  secrets: z.array(z.string()).optional(),
});
export type HostConfig = z.infer<typeof HostConfigSchema>;

export const RemoteConfigSchema = z.object({
  name: z.string(),
  development: z.string(),
  production: z.string(),
  ssr: z.string().optional(),
  proxy: z.string().optional(),
  exposes: z.record(z.string(), z.string()).optional(),
  variables: z.record(z.string(), z.string()).optional(),
  secrets: z.array(z.string()).optional(),
});
export type RemoteConfig = z.infer<typeof RemoteConfigSchema>;

export const GatewayConfigSchema = z.object({
  development: z.string(),
  production: z.string(),
});
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

export const SharedDepConfigSchema = z.object({
  requiredVersion: z.string().optional(),
  singleton: z.boolean().optional(),
  eager: z.boolean().optional(),
  strictVersion: z.boolean().optional(),
});
export type SharedDepConfig = z.infer<typeof SharedDepConfigSchema>;

export const BosConfigSchema = z.object({
  account: z.string(),
  gateway: GatewayConfigSchema,
  templates: z.record(z.string(), z.string()).optional(),
  create: z.record(z.string(), z.string()).optional(),
  cli: z.object({
    version: z.string().optional(),
  }).optional(),
  shared: z.record(z.string(), z.record(z.string(), SharedDepConfigSchema)).optional(),
  app: z.object({
    host: HostConfigSchema,
  }).catchall(z.union([HostConfigSchema, RemoteConfigSchema])),
});
export type BosConfig = z.infer<typeof BosConfigSchema>;

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

import { oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

const SourceModeSchema = z.enum(["local", "remote"]);

const DevOptionsSchema = z.object({
  host: SourceModeSchema.default("local"),
  ui: SourceModeSchema.default("local"),
  api: SourceModeSchema.default("local"),
  proxy: z.boolean().default(false),
  port: z.number().optional(),
});

const DevResultSchema = z.object({
  status: z.enum(["started", "error"]),
  description: z.string(),
  processes: z.array(z.string()),
});

const StartOptionsSchema = z.object({
  port: z.number().optional(),
});

const StartResultSchema = z.object({
  status: z.enum(["running", "error"]),
  url: z.string(),
});

const ServeOptionsSchema = z.object({
  port: z.number().default(4000),
});

const ServeResultSchema = z.object({
  status: z.enum(["serving", "error"]),
  url: z.string(),
  endpoints: z.object({
    rpc: z.string(),
    docs: z.string(),
  }),
});

const BuildOptionsSchema = z.object({
  package: z.string().default("all"),
  force: z.boolean().default(false),
});

const BuildResultSchema = z.object({
  status: z.enum(["success", "error"]),
  built: z.array(z.string()),
});

const PublishResultSchema = z.object({
  status: z.enum(["published", "error"]),
  txHash: z.string(),
  registryUrl: z.string(),
});

const CreateOptionsSchema = z.object({
  type: z.enum(["project", "ui", "api", "host", "cli"]),
  name: z.string().optional(),
  template: z.string().optional(),
});

const CreateResultSchema = z.object({
  status: z.enum(["created", "error"]),
  path: z.string(),
});

const RemoteConfigSchema = z.object({
  name: z.string(),
  development: z.string(),
  production: z.string(),
  ssr: z.string().optional(),
  exposes: z.record(z.string(), z.string()).optional(),
  variables: z.record(z.string(), z.string()).optional(),
  secrets: z.array(z.string()).optional(),
});

const HostConfigSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  development: z.string(),
  production: z.string(),
  remote: z.string().optional(),
  secrets: z.array(z.string()).optional(),
});

const BosConfigSchema = z.object({
  account: z.string(),
  cli: z.object({
    remote: z.string().optional(),
    local: z.string().optional(),
  }).optional(),
  create: z.record(z.string(), z.string()).optional(),
  app: z.object({
    host: HostConfigSchema,
  }).catchall(z.union([HostConfigSchema, RemoteConfigSchema])),
});

const InfoResultSchema = z.object({
  config: BosConfigSchema,
  packages: z.array(z.string()),
  remotes: z.array(z.string()),
});

const EndpointStatusSchema = z.object({
  name: z.string(),
  url: z.string(),
  type: z.enum(["host", "remote", "ssr"]),
  healthy: z.boolean(),
  latency: z.number().optional(),
});

const StatusOptionsSchema = z.object({
  env: z.enum(["development", "production"]).default("development"),
});

const StatusResultSchema = z.object({
  endpoints: z.array(EndpointStatusSchema),
});

const CleanResultSchema = z.object({
  status: z.enum(["cleaned", "error"]),
  removed: z.array(z.string()),
});

export const bosContract = oc.router({
  dev: oc
    .route({ method: "POST", path: "/dev" })
    .input(DevOptionsSchema)
    .output(DevResultSchema),

  start: oc
    .route({ method: "POST", path: "/start" })
    .input(StartOptionsSchema)
    .output(StartResultSchema),

  serve: oc
    .route({ method: "POST", path: "/serve" })
    .input(ServeOptionsSchema)
    .output(ServeResultSchema),

  build: oc
    .route({ method: "POST", path: "/build" })
    .input(BuildOptionsSchema)
    .output(BuildResultSchema),

  publish: oc
    .route({ method: "POST", path: "/publish" })
    .output(PublishResultSchema),

  create: oc
    .route({ method: "POST", path: "/create" })
    .input(CreateOptionsSchema)
    .output(CreateResultSchema),

  info: oc
    .route({ method: "GET", path: "/info" })
    .output(InfoResultSchema),

  status: oc
    .route({ method: "GET", path: "/status" })
    .input(StatusOptionsSchema)
    .output(StatusResultSchema),

  clean: oc
    .route({ method: "POST", path: "/clean" })
    .output(CleanResultSchema),
});

export type BosContract = typeof bosContract;
export type DevOptions = z.infer<typeof DevOptionsSchema>;
export type DevResult = z.infer<typeof DevResultSchema>;
export type StartOptions = z.infer<typeof StartOptionsSchema>;
export type StartResult = z.infer<typeof StartResultSchema>;
export type ServeOptions = z.infer<typeof ServeOptionsSchema>;
export type ServeResult = z.infer<typeof ServeResultSchema>;
export type BuildOptions = z.infer<typeof BuildOptionsSchema>;
export type BuildResult = z.infer<typeof BuildResultSchema>;
export type PublishResult = z.infer<typeof PublishResultSchema>;
export type CreateOptions = z.infer<typeof CreateOptionsSchema>;
export type CreateResult = z.infer<typeof CreateResultSchema>;
export type BosConfig = z.infer<typeof BosConfigSchema>;
export type InfoResult = z.infer<typeof InfoResultSchema>;
export type StatusOptions = z.infer<typeof StatusOptionsSchema>;
export type StatusResult = z.infer<typeof StatusResultSchema>;
export type CleanResult = z.infer<typeof CleanResultSchema>;

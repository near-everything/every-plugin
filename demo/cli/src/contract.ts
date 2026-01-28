import { oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

const SourceModeSchema = z.enum(["local", "remote"]);

const DevOptionsSchema = z.object({
  host: SourceModeSchema.default("local"),
  ui: SourceModeSchema.default("local"),
  api: SourceModeSchema.default("local"),
  proxy: z.boolean().default(false),
  port: z.number().optional(),
  interactive: z.boolean().optional(),
});

const DevResultSchema = z.object({
  status: z.enum(["started", "error"]),
  description: z.string(),
  processes: z.array(z.string()),
});

const StartOptionsSchema = z.object({
  port: z.number().optional(),
  interactive: z.boolean().optional(),
  account: z.string().optional(),
  domain: z.string().optional(),
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
  packages: z.string().default("all"),
  force: z.boolean().default(false),
  deploy: z.boolean().default(false),
});

const BuildResultSchema = z.object({
  status: z.enum(["success", "error"]),
  built: z.array(z.string()),
  deployed: z.boolean().optional(),
});

const SigningMethodSchema = z.enum([
  "keychain",
  "ledger",
  "seed-phrase",
  "access-key-file",
  "private-key",
]);

const PublishOptionsSchema = z.object({
  signWith: SigningMethodSchema.optional(),
  network: z.enum(["mainnet", "testnet"]).default("mainnet"),
  path: z.string().default("bos.config.json"),
  dryRun: z.boolean().default(false),
});

const PublishResultSchema = z.object({
  status: z.enum(["published", "error", "dry-run"]),
  txHash: z.string(),
  registryUrl: z.string(),
  error: z.string().optional(),
});

const CreateOptionsSchema = z.object({
  type: z.enum(["project", "ui", "api", "host", "cli", "gateway"]),
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

const RegisterOptionsSchema = z.object({
  name: z.string(),
  network: z.enum(["mainnet", "testnet"]).default("mainnet"),
});

const RegisterResultSchema = z.object({
  status: z.enum(["registered", "error"]),
  account: z.string(),
  novaGroup: z.string().optional(),
  error: z.string().optional(),
});

const SecretsSyncOptionsSchema = z.object({
  envPath: z.string(),
});

const SecretsSyncResultSchema = z.object({
  status: z.enum(["synced", "error"]),
  count: z.number(),
  cid: z.string().optional(),
  error: z.string().optional(),
});

const SecretsSetOptionsSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const SecretsSetResultSchema = z.object({
  status: z.enum(["set", "error"]),
  cid: z.string().optional(),
  error: z.string().optional(),
});

const SecretsListResultSchema = z.object({
  status: z.enum(["listed", "error"]),
  keys: z.array(z.string()),
  error: z.string().optional(),
});

const SecretsDeleteOptionsSchema = z.object({
  key: z.string(),
});

const SecretsDeleteResultSchema = z.object({
  status: z.enum(["deleted", "error"]),
  cid: z.string().optional(),
  error: z.string().optional(),
});

const LoginOptionsSchema = z.object({
  token: z.string().optional(),
  accountId: z.string().optional(),
});

const LoginResultSchema = z.object({
  status: z.enum(["logged-in", "error"]),
  accountId: z.string().optional(),
  error: z.string().optional(),
});

const LogoutResultSchema = z.object({
  status: z.enum(["logged-out", "error"]),
  error: z.string().optional(),
});

const GatewayDevOptionsSchema = z.object({});

const GatewayDevResultSchema = z.object({
  status: z.enum(["started", "error"]),
  url: z.string(),
  error: z.string().optional(),
});

const GatewayDeployOptionsSchema = z.object({
  env: z.enum(["production", "staging"]).optional(),
});

const GatewayDeployResultSchema = z.object({
  status: z.enum(["deployed", "error"]),
  url: z.string(),
  error: z.string().optional(),
});

const GatewaySyncOptionsSchema = z.object({});

const GatewaySyncResultSchema = z.object({
  status: z.enum(["synced", "error"]),
  gatewayDomain: z.string().optional(),
  gatewayAccount: z.string().optional(),
  error: z.string().optional(),
});

const SyncOptionsSchema = z.object({
  account: z.string().optional(),
  gateway: z.string().optional(),
  force: z.boolean().optional(),
});

const SyncResultSchema = z.object({
  status: z.enum(["synced", "error"]),
  account: z.string(),
  gateway: z.string(),
  cliVersion: z.string(),
  hostUrl: z.string(),
  catalogUpdated: z.boolean(),
  packagesUpdated: z.array(z.string()),
  error: z.string().optional(),
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
    .input(PublishOptionsSchema)
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

  register: oc
    .route({ method: "POST", path: "/register" })
    .input(RegisterOptionsSchema)
    .output(RegisterResultSchema),

  secretsSync: oc
    .route({ method: "POST", path: "/secrets/sync" })
    .input(SecretsSyncOptionsSchema)
    .output(SecretsSyncResultSchema),

  secretsSet: oc
    .route({ method: "POST", path: "/secrets/set" })
    .input(SecretsSetOptionsSchema)
    .output(SecretsSetResultSchema),

  secretsList: oc
    .route({ method: "GET", path: "/secrets/list" })
    .output(SecretsListResultSchema),

  secretsDelete: oc
    .route({ method: "POST", path: "/secrets/delete" })
    .input(SecretsDeleteOptionsSchema)
    .output(SecretsDeleteResultSchema),

  login: oc
    .route({ method: "POST", path: "/login" })
    .input(LoginOptionsSchema)
    .output(LoginResultSchema),

  logout: oc
    .route({ method: "POST", path: "/logout" })
    .output(LogoutResultSchema),

  gatewayDev: oc
    .route({ method: "POST", path: "/gateway/dev" })
    .input(GatewayDevOptionsSchema)
    .output(GatewayDevResultSchema),

  gatewayDeploy: oc
    .route({ method: "POST", path: "/gateway/deploy" })
    .input(GatewayDeployOptionsSchema)
    .output(GatewayDeployResultSchema),

  gatewaySync: oc
    .route({ method: "POST", path: "/gateway/sync" })
    .input(GatewaySyncOptionsSchema)
    .output(GatewaySyncResultSchema),

  sync: oc
    .route({ method: "POST", path: "/sync" })
    .input(SyncOptionsSchema)
    .output(SyncResultSchema),
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
export type SigningMethod = z.infer<typeof SigningMethodSchema>;
export type PublishOptions = z.infer<typeof PublishOptionsSchema>;
export type PublishResult = z.infer<typeof PublishResultSchema>;
export type CreateOptions = z.infer<typeof CreateOptionsSchema>;
export type CreateResult = z.infer<typeof CreateResultSchema>;
export type BosConfig = z.infer<typeof BosConfigSchema>;
export type InfoResult = z.infer<typeof InfoResultSchema>;
export type StatusOptions = z.infer<typeof StatusOptionsSchema>;
export type StatusResult = z.infer<typeof StatusResultSchema>;
export type CleanResult = z.infer<typeof CleanResultSchema>;
export type RegisterOptions = z.infer<typeof RegisterOptionsSchema>;
export type RegisterResult = z.infer<typeof RegisterResultSchema>;
export type SecretsSyncOptions = z.infer<typeof SecretsSyncOptionsSchema>;
export type SecretsSyncResult = z.infer<typeof SecretsSyncResultSchema>;
export type SecretsSetOptions = z.infer<typeof SecretsSetOptionsSchema>;
export type SecretsSetResult = z.infer<typeof SecretsSetResultSchema>;
export type SecretsListResult = z.infer<typeof SecretsListResultSchema>;
export type SecretsDeleteOptions = z.infer<typeof SecretsDeleteOptionsSchema>;
export type SecretsDeleteResult = z.infer<typeof SecretsDeleteResultSchema>;
export type LoginOptions = z.infer<typeof LoginOptionsSchema>;
export type LoginResult = z.infer<typeof LoginResultSchema>;
export type LogoutResult = z.infer<typeof LogoutResultSchema>;
export type SyncOptions = z.infer<typeof SyncOptionsSchema>;
export type SyncResult = z.infer<typeof SyncResultSchema>;

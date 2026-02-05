import { oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import {
  BosConfigSchema,
  SourceModeSchema,
} from "./types";

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
  network: z.enum(["mainnet", "testnet"]).default("mainnet"),
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

const UpdateOptionsSchema = z.object({
  account: z.string().optional(),
  gateway: z.string().optional(),
  network: z.enum(["mainnet", "testnet"]).default("mainnet"),
  force: z.boolean().optional(),
});

const UpdateResultSchema = z.object({
  status: z.enum(["updated", "error"]),
  account: z.string(),
  gateway: z.string(),
  socialUrl: z.string().optional(),
  hostUrl: z.string(),
  catalogUpdated: z.boolean(),
  packagesUpdated: z.array(z.string()),
  filesSynced: z.array(z.object({
    package: z.string(),
    files: z.array(z.string()),
  })).optional(),
  error: z.string().optional(),
});

const FilesSyncOptionsSchema = z.object({
  packages: z.array(z.string()).optional(),
  force: z.boolean().optional(),
});

const FilesSyncResultSchema = z.object({
  status: z.enum(["synced", "error"]),
  synced: z.array(z.object({
    package: z.string(),
    files: z.array(z.string()),
    depsAdded: z.array(z.string()).optional(),
    depsUpdated: z.array(z.string()).optional(),
  })),
  error: z.string().optional(),
});

const KillOptionsSchema = z.object({
  force: z.boolean().default(false),
});

const KillResultSchema = z.object({
  status: z.enum(["killed", "error"]),
  killed: z.array(z.number()),
  failed: z.array(z.number()),
  error: z.string().optional(),
});

const ProcessStatusSchema = z.object({
  pid: z.number(),
  name: z.string(),
  port: z.number(),
  startedAt: z.number(),
  command: z.string(),
});

const PsResultSchema = z.object({
  status: z.enum(["listed", "error"]),
  processes: z.array(ProcessStatusSchema),
  error: z.string().optional(),
});

const DockerBuildOptionsSchema = z.object({
  target: z.enum(["production", "development"]).default("production"),
  tag: z.string().optional(),
  noCache: z.boolean().default(false),
});

const DockerBuildResultSchema = z.object({
  status: z.enum(["built", "error"]),
  image: z.string(),
  tag: z.string(),
  error: z.string().optional(),
});

const DockerRunOptionsSchema = z.object({
  target: z.enum(["production", "development"]).default("production"),
  mode: z.enum(["start", "serve", "dev"]).default("start"),
  port: z.number().optional(),
  detach: z.boolean().default(false),
  env: z.record(z.string(), z.string()).optional(),
});

const DockerRunResultSchema = z.object({
  status: z.enum(["running", "error"]),
  containerId: z.string(),
  url: z.string(),
  error: z.string().optional(),
});

const DockerStopOptionsSchema = z.object({
  containerId: z.string().optional(),
  all: z.boolean().default(false),
});

const DockerStopResultSchema = z.object({
  status: z.enum(["stopped", "error"]),
  stopped: z.array(z.string()),
  error: z.string().optional(),
});

const MonitorOptionsSchema = z.object({
  ports: z.array(z.number()).optional(),
  json: z.boolean().default(false),
  watch: z.boolean().default(false),
});

const PortInfoSchema = z.object({
  port: z.number(),
  pid: z.number().nullable(),
  command: z.string().nullable(),
  state: z.enum(["LISTEN", "ESTABLISHED", "TIME_WAIT", "FREE"]),
  name: z.string().optional(),
});

const ProcessInfoSchema = z.object({
  pid: z.number(),
  ppid: z.number(),
  command: z.string(),
  args: z.array(z.string()),
  rss: z.number(),
  children: z.array(z.number()),
  startTime: z.number().optional(),
});

const MemoryInfoSchema = z.object({
  total: z.number(),
  used: z.number(),
  free: z.number(),
  processRss: z.number(),
});

const SnapshotSchema = z.object({
  timestamp: z.number(),
  configPath: z.string().nullable(),
  ports: z.record(z.string(), PortInfoSchema),
  processes: z.array(ProcessInfoSchema),
  memory: MemoryInfoSchema,
  platform: z.string(),
});

const MonitorResultSchema = z.object({
  status: z.enum(["snapshot", "watching", "error"]),
  snapshot: SnapshotSchema.optional(),
  error: z.string().optional(),
});

const SessionOptionsSchema = z.object({
  headless: z.boolean().default(true),
  timeout: z.number().default(120000),
  output: z.string().default("./session-report.json"),
  format: z.enum(["json", "html"]).default("json"),
  flow: z.enum(["login", "navigation", "custom"]).default("login"),
  routes: z.array(z.string()).optional(),
  snapshotInterval: z.number().default(2000),
});

const SessionSummarySchema = z.object({
  totalMemoryDeltaMb: z.number(),
  peakMemoryMb: z.number(),
  averageMemoryMb: z.number(),
  processesSpawned: z.number(),
  processesKilled: z.number(),
  orphanedProcesses: z.number(),
  portsUsed: z.array(z.number()),
  portsLeaked: z.number(),
  hasLeaks: z.boolean(),
  eventCount: z.number(),
  duration: z.number(),
});

const SessionResultSchema = z.object({
  status: z.enum(["completed", "leaks_detected", "error", "timeout"]),
  sessionId: z.string().optional(),
  reportPath: z.string().optional(),
  summary: SessionSummarySchema.optional(),
  error: z.string().optional(),
});

const DepsUpdateOptionsSchema = z.object({
  category: z.enum(["ui", "api"]).default("ui"),
  packages: z.array(z.string()).optional(),
});

const DepsUpdateResultSchema = z.object({
  status: z.enum(["updated", "cancelled", "error"]),
  updated: z.array(z.object({
    name: z.string(),
    from: z.string(),
    to: z.string(),
  })),
  syncStatus: z.enum(["synced", "skipped", "error"]).optional(),
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

  update: oc
    .route({ method: "POST", path: "/update" })
    .input(UpdateOptionsSchema)
    .output(UpdateResultSchema),

  depsUpdate: oc
    .route({ method: "POST", path: "/deps/update" })
    .input(DepsUpdateOptionsSchema)
    .output(DepsUpdateResultSchema),

  filesSync: oc
    .route({ method: "POST", path: "/files/sync" })
    .input(FilesSyncOptionsSchema)
    .output(FilesSyncResultSchema),

  kill: oc
    .route({ method: "POST", path: "/kill" })
    .input(KillOptionsSchema)
    .output(KillResultSchema),

  ps: oc
    .route({ method: "GET", path: "/ps" })
    .output(PsResultSchema),

  dockerBuild: oc
    .route({ method: "POST", path: "/docker/build" })
    .input(DockerBuildOptionsSchema)
    .output(DockerBuildResultSchema),

  dockerRun: oc
    .route({ method: "POST", path: "/docker/run" })
    .input(DockerRunOptionsSchema)
    .output(DockerRunResultSchema),

  dockerStop: oc
    .route({ method: "POST", path: "/docker/stop" })
    .input(DockerStopOptionsSchema)
    .output(DockerStopResultSchema),

  monitor: oc
    .route({ method: "GET", path: "/monitor" })
    .input(MonitorOptionsSchema)
    .output(MonitorResultSchema),

  session: oc
    .route({ method: "POST", path: "/session" })
    .input(SessionOptionsSchema)
    .output(SessionResultSchema),
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
export type UpdateOptions = z.infer<typeof UpdateOptionsSchema>;
export type UpdateResult = z.infer<typeof UpdateResultSchema>;
export type DepsUpdateOptions = z.infer<typeof DepsUpdateOptionsSchema>;
export type DepsUpdateResult = z.infer<typeof DepsUpdateResultSchema>;
export type FilesSyncOptions = z.infer<typeof FilesSyncOptionsSchema>;
export type FilesSyncResult = z.infer<typeof FilesSyncResultSchema>;
export type MonitorOptions = z.infer<typeof MonitorOptionsSchema>;
export type MonitorResult = z.infer<typeof MonitorResultSchema>;
export type MonitorSnapshot = z.infer<typeof SnapshotSchema>;
export type SessionOptions = z.infer<typeof SessionOptionsSchema>;
export type SessionResult = z.infer<typeof SessionResultSchema>;
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

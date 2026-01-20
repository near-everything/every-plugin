import { serialize as borshSerialize } from "borsh";
import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { z } from "every-plugin/zod";

import {
  type BosConfig as BosConfigType,
  DEFAULT_DEV_CONFIG,
  type DevConfig,
  getConfigDir,
  getHost,
  getHostRemoteUrl,
  getPackages,
  getPortsFromConfig,
  getRemotes,
  loadConfig,
  type SourceMode
} from "./config";
import { bosContract } from "./contract";
import { getBuildEnv, hasZephyrConfig, loadBosEnv, ZEPHYR_DOCS_URL } from "./lib/env";
import { ensureNearCli, executeTransaction } from "./lib/near-cli";
import { type DevOrchestrator, startDev } from "./lib/orchestrator";
import { run } from "./utils/run";
import { colors, icons } from "./utils/theme";

interface BosDeps {
  bosConfig: BosConfigType;
  configDir: string;
  nearPrivateKey?: string;
}

function serializeConfigForFastFS(config: BosConfigType, relativePath: string): Uint8Array {
  const jsonContent = JSON.stringify(config, null, 2);
  const contentBytes = new TextEncoder().encode(jsonContent);

  const fastfsData = {
    simple: {
      relativePath,
      content: {
        mimeType: "application/json",
        content: contentBytes,
      },
    },
  };

  const fastfsSchema = {
    enum: [
      {
        struct: {
          simple: {
            struct: {
              relativePath: "string",
              content: {
                option: {
                  struct: {
                    mimeType: "string",
                    content: { array: { type: "u8" } }
                  }
                }
              }
            }
          }
        }
      }
    ]
  };

  const serialized = borshSerialize(fastfsSchema, fastfsData);
  return new Uint8Array(serialized);
}

function parseSourceMode(value: string | undefined, defaultValue: SourceMode): SourceMode {
  if (value === "local" || value === "remote") return value;
  return defaultValue;
}

function buildDevConfig(options: { host?: string; ui?: string; api?: string; proxy?: boolean }): DevConfig {
  return {
    host: parseSourceMode(options.host, DEFAULT_DEV_CONFIG.host),
    ui: parseSourceMode(options.ui, DEFAULT_DEV_CONFIG.ui),
    api: parseSourceMode(options.api, DEFAULT_DEV_CONFIG.api),
    proxy: options.proxy,
  };
}

function buildDescription(config: DevConfig): string {
  const parts: string[] = [];

  if (config.host === "local" && config.ui === "local" && config.api === "local" && !config.proxy) {
    return "Full Local Development";
  }

  if (config.host === "remote") parts.push("Remote Host");
  else parts.push("Local Host");

  if (config.ui === "remote") parts.push("Remote UI");
  if (config.proxy) parts.push("Proxy API → Production");
  else if (config.api === "remote") parts.push("Remote API");

  return parts.join(" + ");
}

function determineProcesses(config: DevConfig): string[] {
  const processes: string[] = [];

  if (config.ui === "local") {
    processes.push("ui-ssr");
    processes.push("ui");
  }

  if (config.api === "local" && !config.proxy) {
    processes.push("api");
  }

  processes.push("host");

  return processes;
}

function buildEnvVars(config: DevConfig): Record<string, string> {
  const env: Record<string, string> = {};

  env.HOST_SOURCE = config.host;
  env.UI_SOURCE = config.ui;
  env.API_SOURCE = config.api;

  if (config.host === "remote") {
    const remoteUrl = getHostRemoteUrl();
    if (remoteUrl) {
      env.HOST_REMOTE_URL = remoteUrl;
    }
  }

  if (config.proxy) {
    env.API_PROXY = "true";
  }

  return env;
}

const buildCommands: Record<string, { cmd: string; args: string[] }> = {
  host: { cmd: "rsbuild", args: ["build"] },
  ui: { cmd: "build", args: [] },
  api: { cmd: "rspack", args: ["build"] },
};

export default createPlugin({
  variables: z.object({
    configPath: z.string().optional(),
  }),

  secrets: z.object({
    nearPrivateKey: z.string().optional(),
  }),

  contract: bosContract,

  initialize: (config) =>
    Effect.sync(() => {
      const bosConfig = loadConfig(config.variables.configPath);
      const configDir = getConfigDir();

      return {
        bosConfig,
        configDir,
        nearPrivateKey: config.secrets.nearPrivateKey
      };
    }),

  shutdown: () => Effect.void,

  createRouter: (deps: BosDeps, builder) => ({
    dev: builder.dev.handler(async ({ input }) => {
      const devConfig = buildDevConfig({
        host: input.host,
        ui: input.ui,
        api: input.api,
        proxy: input.proxy,
      });

      if (devConfig.host === "remote") {
        const remoteUrl = getHostRemoteUrl();
        if (!remoteUrl) {
          return {
            status: "error" as const,
            description: "No remote URL configured for host",
            processes: [],
          };
        }
      }

      const processes = determineProcesses(devConfig);
      const env = buildEnvVars(devConfig);
      const description = buildDescription(devConfig);

      const orchestrator: DevOrchestrator = {
        packages: processes,
        env,
        description,
        devConfig,
        port: input.port,
        interactive: input.interactive,
      };

      startDev(orchestrator);

      return {
        status: "started" as const,
        description,
        processes,
      };
    }),

    start: builder.start.handler(async ({ input }) => {
      const remoteUrl = getHostRemoteUrl();
      if (!remoteUrl) {
        return {
          status: "error" as const,
          url: "",
        };
      }

      const ports = getPortsFromConfig();
      const port = input.port ?? ports.host;

      const startConfig: DevConfig = {
        host: "remote",
        ui: "remote",
        api: "remote",
      };

      const env: Record<string, string> = {
        HOST_SOURCE: "remote",
        UI_SOURCE: "remote",
        API_SOURCE: "remote",
        HOST_REMOTE_URL: remoteUrl,
      };

      const orchestrator: DevOrchestrator = {
        packages: ["host"],
        env,
        description: "Production Mode (all remotes)",
        devConfig: startConfig,
        port,
        interactive: input.interactive,
        noLogs: true,
      };

      startDev(orchestrator);

      return {
        status: "running" as const,
        url: `http://localhost:${port}`,
      };
    }),

    serve: builder.serve.handler(async ({ input }) => {
      const port = input.port;
      return {
        status: "serving" as const,
        url: `http://localhost:${port}`,
        endpoints: {
          rpc: `http://localhost:${port}/api/rpc`,
          docs: `http://localhost:${port}/api`,
        },
      };
    }),

    build: builder.build.handler(async ({ input: buildInput }) => {
      const packages = getPackages();
      const { configDir } = deps;

      if (buildInput.package !== "all" && !packages.includes(buildInput.package)) {
        return {
          status: "error" as const,
          built: [],
        };
      }

      const targets = buildInput.package === "all" ? packages : [buildInput.package];
      const built: string[] = [];

      const buildEffect = Effect.gen(function* () {
        const bosEnv = yield* loadBosEnv;
        const env = getBuildEnv(bosEnv);

        if (!buildInput.deploy) {
          env.NODE_ENV = "development";
        } else {
          env.NODE_ENV = "production";
          if (!hasZephyrConfig(bosEnv)) {
            console.log(colors.dim(`  ${icons.config} Zephyr tokens not configured - you may be prompted to login`));
            console.log(colors.dim(`  Setup: ${ZEPHYR_DOCS_URL}`));
            console.log();
          }
        }

        for (const target of targets) {
          const buildConfig = buildCommands[target];
          if (!buildConfig) continue;

          yield* Effect.tryPromise({
            try: () => run("bun", ["run", buildConfig.cmd, ...buildConfig.args], {
              cwd: `${configDir}/${target}`,
              env,
            }),
            catch: (e) => new Error(`Build failed for ${target}: ${e}`),
          });
          built.push(target);
        }
      });

      await Effect.runPromise(buildEffect);

      return {
        status: "success" as const,
        built,
        deployed: buildInput.deploy,
      };
    }),

    publish: builder.publish.handler(async ({ input: publishInput }) => {
      const { bosConfig, nearPrivateKey } = deps;

      const relativePath = publishInput.path;
      const contractId = "fastfs.near";

      const publishEffect = Effect.gen(function* () {
        yield* ensureNearCli;

        const bosEnv = yield* loadBosEnv;
        const privateKey = nearPrivateKey || bosEnv.NEAR_PRIVATE_KEY;

        const serializedData = serializeConfigForFastFS(bosConfig, relativePath);
        const argsBase64 = Buffer.from(serializedData).toString("base64");

        if (publishInput.dryRun) {
          return {
            status: "dry-run" as const,
            txHash: "",
            registryUrl: `https://${bosConfig.account}.fastfs.io/${contractId}/${relativePath}`,
          };
        }

        const result = yield* executeTransaction({
          account: bosConfig.account,
          contract: contractId,
          method: "__fastdata_fastfs",
          argsBase64,
          network: publishInput.network,
          privateKey,
          gas: "300Tgas",
          deposit: "0NEAR",
        });

        return {
          status: "published" as const,
          txHash: result.txHash || "unknown",
          registryUrl: `https://${bosConfig.account}.fastfs.io/${contractId}/${relativePath}`,
        };
      });

      try {
        return await Effect.runPromise(publishEffect);
      } catch (error) {
        return {
          status: "error" as const,
          txHash: "",
          registryUrl: "",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

    create: builder.create.handler(async ({ input }) => {
      const { execa } = await import("execa");
      const { join } = await import("path");

      const ports = getPortsFromConfig();

      const DEFAULT_TEMPLATES: Record<string, string> = {
        project: "near-everything/every-plugin/demo",
        ui: "near-everything/every-plugin/demo/ui",
        api: "near-everything/every-plugin/demo/api",
        host: "near-everything/every-plugin/demo/host",
      };

      const template = input.template || deps.bosConfig.create?.[input.type] || DEFAULT_TEMPLATES[input.type];
      const dest = input.type === "project" ? input.name! : input.type;

      try {
        await execa("npx", ["degit", template, dest], { stdio: "inherit" });

        if (input.type === "project" && input.name) {
          const newConfig = {
            account: `${input.name}.near`,
            create: DEFAULT_TEMPLATES,
            app: {
              host: {
                title: input.name,
                description: `${input.name} BOS application`,
                development: `http://localhost:${ports.host}`,
                production: `https://${input.name}.example.com`,
              },
              ui: {
                name: "ui",
                development: `http://localhost:${ports.ui}`,
                production: "",
                exposes: {
                  App: "./App",
                  components: "./components",
                  providers: "./providers",
                  types: "./types",
                },
              },
              api: {
                name: "api",
                development: `http://localhost:${ports.api}`,
                production: "",
                variables: {},
                secrets: [],
              },
            },
          };

          const configPath = join(dest, "bos.config.json");
          await Bun.write(configPath, JSON.stringify(newConfig, null, 2));
        }

        return {
          status: "created" as const,
          path: dest,
        };
      } catch {
        return {
          status: "error" as const,
          path: dest,
        };
      }
    }),

    info: builder.info.handler(async () => {
      const config = deps.bosConfig;
      const packages = getPackages();
      const remotes = getRemotes();

      return {
        config: config as any,
        packages,
        remotes,
      };
    }),

    status: builder.status.handler(async ({ input }) => {
      const config = deps.bosConfig;
      const host = getHost();
      const remotes = getRemotes();
      const env = input.env;

      interface Endpoint {
        name: string;
        url: string;
        type: "host" | "remote" | "ssr";
        healthy: boolean;
        latency?: number;
      }

      const endpoints: Endpoint[] = [];

      const checkHealth = async (url: string): Promise<{ healthy: boolean; latency?: number }> => {
        const start = Date.now();
        try {
          const response = await fetch(url, { method: "HEAD" });
          return {
            healthy: response.ok,
            latency: Date.now() - start,
          };
        } catch {
          return { healthy: false };
        }
      };

      const hostHealth = await checkHealth(host[env]);
      endpoints.push({
        name: "host",
        url: host[env],
        type: "host",
        ...hostHealth,
      });

      for (const name of remotes) {
        const remote = config.app[name];
        if (!remote || !("name" in remote)) continue;

        const remoteHealth = await checkHealth(remote[env]);
        endpoints.push({
          name,
          url: remote[env],
          type: "remote",
          ...remoteHealth,
        });

        if ((remote as any).ssr && env === "production") {
          const ssrHealth = await checkHealth((remote as any).ssr);
          endpoints.push({
            name: `${name}/ssr`,
            url: (remote as any).ssr,
            type: "ssr",
            ...ssrHealth,
          });
        }
      }

      return { endpoints };
    }),

    clean: builder.clean.handler(async () => {
      const { configDir } = deps;
      const packages = getPackages();
      const removed: string[] = [];

      for (const pkg of packages) {
        const distPath = `${configDir}/${pkg}/dist`;
        try {
          await Bun.spawn(["rm", "-rf", distPath]).exited;
          removed.push(`${pkg}/dist`);
        } catch { }

        const nodeModulesPath = `${configDir}/${pkg}/node_modules`;
        try {
          await Bun.spawn(["rm", "-rf", nodeModulesPath]).exited;
          removed.push(`${pkg}/node_modules`);
        } catch { }
      }

      return {
        status: "cleaned" as const,
        removed,
      };
    }),
  }),
});

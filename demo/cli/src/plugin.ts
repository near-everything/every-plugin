import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { z } from "every-plugin/zod";
import { Near } from "near-kit";
import { serialize as borshSerialize } from "borsh";

import { bosContract } from "./contract";
import {
  loadConfig,
  getPackages,
  getRemotes,
  getHost,
  getConfigDir,
  type BosConfig as BosConfigType,
  type DevConfig,
  DEFAULT_DEV_CONFIG,
  getHostRemoteUrl,
  type SourceMode,
} from "./config";
import { startDev, type DevOrchestrator } from "./lib/orchestrator";
import { run } from "./utils/run";

interface BosDeps {
  bosConfig: BosConfigType;
  configDir: string;
  near: Near | null;
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

      let near: Near | null = null;
      if (config.secrets.nearPrivateKey) {
        near = new Near({
          network: "mainnet",
          privateKey: config.secrets.nearPrivateKey as `ed25519:${string}`,
          defaultSignerId: bosConfig.account,
        });
      }

      return { bosConfig, configDir, near };
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
      };

      startDev(orchestrator);

      return {
        status: "started" as const,
        description,
        processes,
      };
    }),

    start: builder.start.handler(async ({ input }) => {
      const host = getHost();
      return {
        status: "running" as const,
        url: host.production,
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

    build: builder.build.handler(async ({ input }) => {
      const packages = getPackages();
      const { configDir } = deps;

      if (input.package !== "all" && !packages.includes(input.package)) {
        return {
          status: "error" as const,
          built: [],
        };
      }

      const targets = input.package === "all" ? packages : [input.package];
      const built: string[] = [];

      for (const target of targets) {
        const buildConfig = buildCommands[target];
        if (!buildConfig) continue;

        await run("bun", ["run", buildConfig.cmd, ...buildConfig.args], {
          cwd: `${configDir}/${target}`,
        });
        built.push(target);
      }

      return {
        status: "success" as const,
        built,
      };
    }),

    publish: builder.publish.handler(async () => {
      const { bosConfig, near } = deps;

      if (!near) {
        return {
          status: "error" as const,
          txHash: "",
          registryUrl: "",
        };
      }

      const relativePath = "bos.config.json";
      const contractId = "fastfs.near";
      const serializedData = serializeConfigForFastFS(bosConfig, relativePath);

      const result = await near
        .transaction(bosConfig.account)
        .functionCall(
          contractId,
          "__fastdata_fastfs",
          serializedData,
          {
            gas: "300 Tgas",
            attachedDeposit: "0 NEAR",
          }
        )
        .send();

      const txHash = result.transaction?.hash || result.transaction_outcome?.id || "unknown";
      const registryUrl = `https://${bosConfig.account}.fastfs.io/${contractId}/${relativePath}`;

      return {
        status: "published" as const,
        txHash,
        registryUrl,
      };
    }),

    create: builder.create.handler(async ({ input }) => {
      const { execa } = await import("execa");
      const { join } = await import("path");

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
                development: "http://localhost:3001",
                production: `https://${input.name}.example.com`,
              },
              ui: {
                name: "ui",
                development: "http://localhost:3002",
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
                development: "http://localhost:3014",
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
        } catch {}

        const nodeModulesPath = `${configDir}/${pkg}/node_modules`;
        try {
          await Bun.spawn(["rm", "-rf", nodeModulesPath]).exited;
          removed.push(`${pkg}/node_modules`);
        } catch {}
      }

      return {
        status: "cleaned" as const,
        removed,
      };
    }),
  }),
});

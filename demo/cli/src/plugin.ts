import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { z } from "every-plugin/zod";
import { Graph } from "near-social-js";

import {
  type BosConfig as BosConfigType,
  DEFAULT_DEV_CONFIG,
  type AppConfig,
  getConfigDir,
  getHost,
  getHostRemoteUrl,
  getPackages,
  getPortsFromConfig,
  getRemotes,
  loadConfig,
  setConfig,
  type SourceMode
} from "./config";
import { bosContract } from "./contract";
import { getBuildEnv, hasZephyrConfig, loadBosEnv, ZEPHYR_DOCS_URL } from "./lib/env";
import { createSubaccount, ensureNearCli, executeTransaction } from "./lib/near-cli";
import {
  createNovaClient,
  getNovaConfig,
  getSecretsGroupId,
  hasNovaCredentials,
  parseEnvFile,
  registerSecretsGroup,
  removeNovaCredentials,
  retrieveSecrets,
  saveNovaCredentials,
  uploadSecrets,
  verifyNovaCredentials,
} from "./lib/nova";
import { type AppOrchestrator, startApp } from "./lib/orchestrator";
import { run } from "./utils/run";
import { colors, icons } from "./utils/theme";

interface BosDeps {
  bosConfig: BosConfigType | null;
  configDir: string;
  nearPrivateKey?: string;
}

function getGatewayDomain(config: BosConfigType): string {
  const gateway = config.gateway as string | { production: string } | undefined;
  if (typeof gateway === "string") {
    return gateway.replace(/^https?:\/\//, "");
  }
  if (gateway && typeof gateway === "object" && "production" in gateway) {
    return gateway.production.replace(/^https?:\/\//, "");
  }
  throw new Error("bos.config.json must have a 'gateway' field with production URL");
}

function buildSocialSetArgs(account: string, gatewayDomain: string, config: BosConfigType): object {
  return {
    data: {
      [account]: {
        bos: {
          gateways: {
            [gatewayDomain]: {
              "bos.config.json": JSON.stringify(config),
            },
          },
        },
      },
    },
  };
}

function parseSourceMode(value: string | undefined, defaultValue: SourceMode): SourceMode {
  if (value === "local" || value === "remote") return value;
  return defaultValue;
}

function buildAppConfig(options: { host?: string; ui?: string; api?: string; proxy?: boolean }): AppConfig {
  return {
    host: parseSourceMode(options.host, DEFAULT_DEV_CONFIG.host),
    ui: parseSourceMode(options.ui, DEFAULT_DEV_CONFIG.ui),
    api: parseSourceMode(options.api, DEFAULT_DEV_CONFIG.api),
    proxy: options.proxy,
  };
}

function buildDescription(config: AppConfig): string {
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

function determineProcesses(config: AppConfig): string[] {
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

function buildEnvVars(config: AppConfig): Record<string, string> {
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
      } as BosDeps;
    }),

  shutdown: () => Effect.void,

  createRouter: (deps: BosDeps, builder) => ({
    dev: builder.dev.handler(async ({ input }) => {
      const appConfig = buildAppConfig({
        host: input.host,
        ui: input.ui,
        api: input.api,
        proxy: input.proxy,
      });

      if (appConfig.host === "remote") {
        const remoteUrl = getHostRemoteUrl();
        if (!remoteUrl) {
          return {
            status: "error" as const,
            description: "No remote URL configured for host",
            processes: [],
          };
        }
      }

      const processes = determineProcesses(appConfig);
      const env = buildEnvVars(appConfig);
      const description = buildDescription(appConfig);

      const orchestrator: AppOrchestrator = {
        packages: processes,
        env,
        description,
        appConfig,
        port: input.port,
        interactive: input.interactive,
      };

      startApp(orchestrator);

      return {
        status: "started" as const,
        description,
        processes,
      };
    }),

    start: builder.start.handler(async ({ input }) => {
      let remoteConfig: BosConfigType | null = null;

      if (input.account && input.domain) {
        const graph = new Graph();
        const configPath = `${input.account}/bos/gateways/${input.domain}/bos.config.json`;
        
        try {
          const data = await graph.get({ keys: [configPath] });
          if (data) {
            const parts = configPath.split("/");
            let current: unknown = data;
            for (const part of parts) {
              if (current && typeof current === "object" && part in current) {
                current = (current as Record<string, unknown>)[part];
              } else {
                current = null;
                break;
              }
            }
            if (typeof current === "string") {
              remoteConfig = JSON.parse(current) as BosConfigType;
              setConfig(remoteConfig);
            }
          }
        } catch (error) {
          console.error(`Failed to fetch config from social.near:`, error);
          return {
            status: "error" as const,
            url: "",
          };
        }

        if (!remoteConfig) {
          console.error(`No config found at ${configPath}`);
          return {
            status: "error" as const,
            url: "",
          };
        }
      }

      const config = remoteConfig || deps.bosConfig;
      
      if (!config) {
        console.error("No configuration available. Provide --account and --domain, or run from a BOS project directory.");
        return {
          status: "error" as const,
          url: "",
        };
      }

      const port = input.port ?? 3000;

      const env: Record<string, string> = {
        NODE_ENV: "production",
        HOST_SOURCE: "remote",
        UI_SOURCE: "remote",
        API_SOURCE: "remote",
        BOS_ACCOUNT: config.account,
        HOST_REMOTE_URL: config.app.host.production,
        UI_REMOTE_URL: config.app.ui.production,
        API_REMOTE_URL: config.app.api.production,
      };

      const uiConfig = config.app.ui as { ssr?: string };
      if (uiConfig.ssr) {
        env.UI_SSR_URL = uiConfig.ssr;
      }

      const orchestrator: AppOrchestrator = {
        packages: ["host"],
        env,
        description: `Production Mode (${config.account})`,
        appConfig: {
          host: "remote",
          ui: "remote",
          api: "remote",
        },
        port,
        interactive: input.interactive,
        noLogs: true,
      };

      startApp(orchestrator);

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

      if (!bosConfig) {
        return {
          status: "error" as const,
          txHash: "",
          registryUrl: "",
          error: "No bos.config.json found. Run from a BOS project directory.",
        };
      }

      const gatewayDomain = getGatewayDomain(bosConfig);
      const socialPath = `${bosConfig.account}/bos/gateways/${gatewayDomain}/bos.config.json`;

      const publishEffect = Effect.gen(function* () {
        yield* ensureNearCli;

        const bosEnv = yield* loadBosEnv;
        const privateKey = nearPrivateKey || bosEnv.NEAR_PRIVATE_KEY;

        const socialArgs = buildSocialSetArgs(bosConfig.account, gatewayDomain, bosConfig);
        const argsBase64 = Buffer.from(JSON.stringify(socialArgs)).toString("base64");

        if (publishInput.dryRun) {
          return {
            status: "dry-run" as const,
            txHash: "",
            registryUrl: `https://near.social/${socialPath}`,
          };
        }

        const result = yield* executeTransaction({
          account: bosConfig.account,
          contract: "social.near",
          method: "set",
          argsBase64,
          network: publishInput.network,
          privateKey,
          gas: "300Tgas",
          deposit: "0.05NEAR",
        });

        return {
          status: "published" as const,
          txHash: result.txHash || "unknown",
          registryUrl: `https://near.social/${socialPath}`,
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
        gateway: "near-everything/every-plugin/demo/gateway",
      };

      const template = input.template || deps.bosConfig?.create?.[input.type] || DEFAULT_TEMPLATES[input.type];
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
      
      if (!config) {
        return { endpoints: [] };
      }

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

    register: builder.register.handler(async ({ input }) => {
      const { bosConfig } = deps;

      if (!bosConfig) {
        return {
          status: "error" as const,
          account: input.name,
          error: "No bos.config.json found. Run from a BOS project directory.",
        };
      }

      const registerEffect = Effect.gen(function* () {
        yield* ensureNearCli;

        const bosEnv = yield* loadBosEnv;
        const gatewayPrivateKey = bosEnv.GATEWAY_PRIVATE_KEY;

        const fullAccount = `${input.name}.${bosConfig.account}`;
        const parentAccount = bosConfig.account;

        yield* createSubaccount({
          newAccount: fullAccount,
          parentAccount,
          initialBalance: "0.1NEAR",
          network: input.network,
          privateKey: gatewayPrivateKey,
        });

        const novaConfig = yield* getNovaConfig;
        const nova = createNovaClient(novaConfig);

        yield* registerSecretsGroup(nova, fullAccount, parentAccount);

        return {
          status: "registered" as const,
          account: fullAccount,
          novaGroup: getSecretsGroupId(fullAccount),
        };
      });

      try {
        return await Effect.runPromise(registerEffect);
      } catch (error) {
        return {
          status: "error" as const,
          account: `${input.name}.${bosConfig.account}`,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

    secretsSync: builder.secretsSync.handler(async ({ input }) => {
      const { bosConfig } = deps;

      if (!bosConfig) {
        return {
          status: "error" as const,
          count: 0,
          error: "No bos.config.json found. Run from a BOS project directory.",
        };
      }

      const syncEffect = Effect.gen(function* () {
        const novaConfig = yield* getNovaConfig;
        const nova = createNovaClient(novaConfig);
        const groupId = getSecretsGroupId(bosConfig.account);

        const envContent = yield* Effect.tryPromise({
          try: () => Bun.file(input.envPath).text(),
          catch: (e) => new Error(`Failed to read env file: ${e}`),
        });

        const secrets = parseEnvFile(envContent);
        const result = yield* uploadSecrets(nova, groupId, secrets);

        return {
          status: "synced" as const,
          count: Object.keys(secrets).length,
          cid: result.cid,
        };
      });

      try {
        return await Effect.runPromise(syncEffect);
      } catch (error) {
        return {
          status: "error" as const,
          count: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

    secretsSet: builder.secretsSet.handler(async ({ input }) => {
      const { bosConfig } = deps;

      if (!bosConfig) {
        return {
          status: "error" as const,
          error: "No bos.config.json found. Run from a BOS project directory.",
        };
      }

      const setEffect = Effect.gen(function* () {
        const novaConfig = yield* getNovaConfig;
        const nova = createNovaClient(novaConfig);
        const groupId = getSecretsGroupId(bosConfig.account);

        const result = yield* uploadSecrets(nova, groupId, { [input.key]: input.value });

        return {
          status: "set" as const,
          cid: result.cid,
        };
      });

      try {
        return await Effect.runPromise(setEffect);
      } catch (error) {
        return {
          status: "error" as const,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

    secretsList: builder.secretsList.handler(async () => {
      const { bosConfig } = deps;

      if (!bosConfig) {
        return {
          status: "error" as const,
          keys: [],
          error: "No bos.config.json found. Run from a BOS project directory.",
        };
      }

      const listEffect = Effect.gen(function* () {
        const novaConfig = yield* getNovaConfig;
        const nova = createNovaClient(novaConfig);
        const groupId = getSecretsGroupId(bosConfig.account);

        const bosEnv = yield* loadBosEnv;
        const cid = bosEnv.NOVA_SECRETS_CID;

        if (!cid) {
          return {
            status: "listed" as const,
            keys: [] as string[],
          };
        }

        const secretsData = yield* retrieveSecrets(nova, groupId, cid);

        return {
          status: "listed" as const,
          keys: Object.keys(secretsData.secrets),
        };
      });

      try {
        return await Effect.runPromise(listEffect);
      } catch (error) {
        return {
          status: "error" as const,
          keys: [],
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

    secretsDelete: builder.secretsDelete.handler(async ({ input }) => {
      const { bosConfig } = deps;

      if (!bosConfig) {
        return {
          status: "error" as const,
          error: "No bos.config.json found. Run from a BOS project directory.",
        };
      }

      const deleteEffect = Effect.gen(function* () {
        const novaConfig = yield* getNovaConfig;
        const nova = createNovaClient(novaConfig);
        const groupId = getSecretsGroupId(bosConfig.account);

        const bosEnv = yield* loadBosEnv;
        const cid = bosEnv.NOVA_SECRETS_CID;

        if (!cid) {
          return yield* Effect.fail(new Error("No secrets found to delete from"));
        }

        const secretsData = yield* retrieveSecrets(nova, groupId, cid);
        const { [input.key]: _, ...remainingSecrets } = secretsData.secrets;

        const result = yield* uploadSecrets(nova, groupId, remainingSecrets);

        return {
          status: "deleted" as const,
          cid: result.cid,
        };
      });

      try {
        return await Effect.runPromise(deleteEffect);
      } catch (error) {
        return {
          status: "error" as const,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

    login: builder.login.handler(async ({ input }) => {
      const loginEffect = Effect.gen(function* () {
        const { token, accountId } = input;

        if (!token || !accountId) {
          return yield* Effect.fail(new Error("Both token and accountId are required"));
        }

        yield* verifyNovaCredentials(accountId, token);
        yield* saveNovaCredentials(accountId, token);

        return {
          status: "logged-in" as const,
          accountId,
        };
      });

      try {
        return await Effect.runPromise(loginEffect);
      } catch (error) {
        let message = "Unknown error";
        if (error instanceof Error) {
          message = error.message;
        } else if (typeof error === "object" && error !== null) {
          if ("message" in error) {
            message = String(error.message);
          } else if ("_tag" in error && "error" in error) {
            const inner = (error as { error: unknown }).error;
            message = inner instanceof Error ? inner.message : String(inner);
          } else {
            message = JSON.stringify(error);
          }
        } else {
          message = String(error);
        }
        console.error("Login error details:", error);
        return {
          status: "error" as const,
          error: message,
        };
      }
    }),

    logout: builder.logout.handler(async () => {
      const logoutEffect = Effect.gen(function* () {
        yield* removeNovaCredentials;

        return {
          status: "logged-out" as const,
        };
      });

      try {
        return await Effect.runPromise(logoutEffect);
      } catch (error) {
        return {
          status: "error" as const,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

    gatewayDev: builder.gatewayDev.handler(async () => {
      const { configDir } = deps;
      const gatewayDir = `${configDir}/gateway`;

      const devEffect = Effect.gen(function* () {
        const { execa } = yield* Effect.tryPromise({
          try: () => import("execa"),
          catch: (e) => new Error(`Failed to import execa: ${e}`),
        });

        const subprocess = execa("npx", ["wrangler", "dev"], {
          cwd: gatewayDir,
          stdio: "inherit",
        });

        subprocess.catch(() => {});

        return {
          status: "started" as const,
          url: "http://localhost:8787",
        };
      });

      try {
        return await Effect.runPromise(devEffect);
      } catch (error) {
        return {
          status: "error" as const,
          url: "",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

    gatewayDeploy: builder.gatewayDeploy.handler(async ({ input }) => {
      const { configDir, bosConfig } = deps;

      if (!bosConfig) {
        return {
          status: "error" as const,
          url: "",
          error: "No bos.config.json found. Run from a BOS project directory.",
        };
      }

      const gatewayDir = `${configDir}/gateway`;

      const deployEffect = Effect.gen(function* () {
        const { execa } = yield* Effect.tryPromise({
          try: () => import("execa"),
          catch: (e) => new Error(`Failed to import execa: ${e}`),
        });

        const args = ["wrangler", "deploy"];
        if (input.env) {
          args.push("--env", input.env);
        }

        yield* Effect.tryPromise({
          try: () => execa("npx", args, {
            cwd: gatewayDir,
            stdio: "inherit",
          }),
          catch: (e) => new Error(`Deploy failed: ${e}`),
        });

        const gatewayDomain = getGatewayDomain(bosConfig);
        const domain = input.env === "staging" ? `staging.${gatewayDomain}` : gatewayDomain;

        return {
          status: "deployed" as const,
          url: `https://${domain}`,
        };
      });

      try {
        return await Effect.runPromise(deployEffect);
      } catch (error) {
        return {
          status: "error" as const,
          url: "",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

    gatewaySync: builder.gatewaySync.handler(async () => {
      const { configDir, bosConfig } = deps;

      if (!bosConfig) {
        return {
          status: "error" as const,
          error: "No bos.config.json found. Run from a BOS project directory.",
        };
      }

      const wranglerPath = `${configDir}/gateway/wrangler.toml`;

      try {
        const gatewayDomain = getGatewayDomain(bosConfig);
        const gatewayAccount = bosConfig.account;

        const wranglerContent = await Bun.file(wranglerPath).text();

        let updatedContent = wranglerContent.replace(
          /GATEWAY_DOMAIN\s*=\s*"[^"]*"/g,
          `GATEWAY_DOMAIN = "${gatewayDomain}"`
        );
        updatedContent = updatedContent.replace(
          /GATEWAY_ACCOUNT\s*=\s*"[^"]*"/g,
          `GATEWAY_ACCOUNT = "${gatewayAccount}"`
        );

        await Bun.write(wranglerPath, updatedContent);

        return {
          status: "synced" as const,
          gatewayDomain,
          gatewayAccount,
        };
      } catch (error) {
        return {
          status: "error" as const,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),
  }),
});

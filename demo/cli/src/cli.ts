#!/usr/bin/env bun
import { spinner } from "@clack/prompts";
import { program } from "commander";
import { createPluginRuntime } from "every-plugin";
import { getConfigDir, getConfigPath, getPackages, getTitle, loadConfig, type BosConfig } from "./config";
import BosPlugin from "./plugin";
import { printBanner } from "./utils/banner";
import { colors, frames, gradients, icons } from "./utils/theme";

function getHelpHeader(config: BosConfig | null, configPath: string): string {
  const host = config?.app.host;
  const lines: string[] = [];

  lines.push("");
  lines.push(colors.cyan(frames.top(52)));
  lines.push(`  ${icons.config} ${gradients.cyber("BOS CLI")} ${colors.dim("v1.0.0")}`);
  lines.push(colors.cyan(frames.bottom(52)));
  lines.push("");
  
  if (config) {
    lines.push(`  ${colors.dim("Account")} ${colors.cyan(config.account)}`);
    lines.push(`  ${colors.dim("Gateway")} ${colors.white(config.gateway?.production ?? "not configured")}`);
    lines.push(`  ${colors.dim("Config ")} ${colors.dim(configPath)}`);
    if (host?.description) {
      lines.push(`  ${colors.dim("About  ")} ${colors.white(host.description)}`);
    }
  } else {
    lines.push(`  ${colors.dim("No project config found")}`);
    lines.push(`  ${colors.dim("Run")} ${colors.cyan("bos create project <name>")} ${colors.dim("to get started")}`);
  }
  
  lines.push("");
  lines.push(colors.cyan(frames.top(52)));
  lines.push("");

  return lines.join("\n");
}

function requireConfig(config: BosConfig | null): asserts config is BosConfig {
  if (!config) {
    console.error(colors.error(`${icons.err} Could not find bos.config.json`));
    console.log(colors.dim("  Run 'bos create project <name>' to create a new project"));
    process.exit(1);
  }
}

async function main() {
  const config = loadConfig();
  const configPath = config ? getConfigPath() : process.cwd();
  const packages = config ? getPackages() : [];
  const title = config ? getTitle() : "BOS CLI";

  if (config) {
    const envPath = `${getConfigDir()}/.env.bos`;
    const envFile = Bun.file(envPath);
    if (await envFile.exists()) {
      const content = await envFile.text();
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }

  printBanner(title);

  const runtime = createPluginRuntime({
    registry: {
      "bos-cli": { module: BosPlugin }
    },
    secrets: {
      NEAR_PRIVATE_KEY: process.env.NEAR_PRIVATE_KEY || "",
    }
  });

  // biome-ignore lint/correctness/useHookAtTopLevel: usePlugin is not a React hook
  const result = await runtime.usePlugin("bos-cli", {
    variables: {},
    secrets: {
      nearPrivateKey: process.env.NEAR_PRIVATE_KEY || "",
    },
  });

  const client = result.createClient();

  program
    .name("bos")
    .version("1.0.0")
    .addHelpText("before", getHelpHeader(config, configPath));

  program
    .command("info")
    .description("Show current configuration")
    .action(async () => {
      const result = await client.info({});

      console.log();
      console.log(colors.cyan(frames.top(52)));
      console.log(`  ${icons.config} ${gradients.cyber("CONFIGURATION")}`);
      console.log(colors.cyan(frames.bottom(52)));
      console.log();

      console.log(`  ${colors.dim("Account")}  ${colors.cyan(result.config.account)}`);
      console.log(`  ${colors.dim("Config ")}  ${colors.dim(configPath)}`);
      console.log();

      const host = result.config.app.host;
      console.log(colors.magenta(`  ┌─ HOST ${"─".repeat(42)}┐`));
      console.log(`  ${colors.magenta("│")} ${colors.dim("title")}        ${colors.white(host.title)}`);
      if (host.description) {
        console.log(`  ${colors.magenta("│")} ${colors.dim("description")}  ${colors.gray(host.description)}`);
      }
      console.log(`  ${colors.magenta("│")} ${colors.dim("development")}  ${colors.cyan(host.development)}`);
      console.log(`  ${colors.magenta("│")} ${colors.dim("production")}   ${colors.green(host.production)}`);
      console.log(colors.magenta(`  └${"─".repeat(49)}┘`));

      for (const remoteName of result.remotes) {
        const remote = result.config.app[remoteName];
        if (!remote || !("name" in remote)) continue;

        console.log();
        const color = remoteName === "ui" ? colors.cyan : colors.blue;
        console.log(color(`  ┌─ ${remoteName.toUpperCase()} ${"─".repeat(46 - remoteName.length)}┐`));
        console.log(`  ${color("│")} ${colors.dim("development")}  ${colors.cyan(remote.development)}`);
        console.log(`  ${color("│")} ${colors.dim("production")}   ${colors.green(remote.production)}`);
        if ("ssr" in remote && remote.ssr) {
          console.log(`  ${color("│")} ${colors.dim("ssr")}          ${colors.purple(remote.ssr as string)}`);
        }
        console.log(color(`  └${"─".repeat(49)}┘`));
      }

      console.log();
    });

  program
    .command("status")
    .description("Check remote health")
    .option("-e, --env <env>", "Environment (development | production)", "development")
    .action(async (options: { env: string }) => {
      const result = await client.status({ env: options.env as "development" | "production" });

      console.log();
      console.log(colors.cyan(frames.top(48)));
      console.log(`  ${icons.scan} ${gradients.cyber("ENDPOINT STATUS")}`);
      console.log(colors.cyan(frames.bottom(48)));
      console.log();

      for (const endpoint of result.endpoints) {
        const status = endpoint.healthy
          ? colors.green(`${icons.ok} healthy`)
          : colors.error(`${icons.err} unhealthy`);
        const latency = endpoint.latency ? colors.dim(` (${endpoint.latency}ms)`) : "";
        console.log(`  ${endpoint.name}: ${status}${latency}`);
        console.log(colors.dim(`    ${endpoint.url}`));
      }
      console.log();
    });

  program
    .command("dev")
    .description(`Start development (${packages.join(", ")})`)
    .option("--host <mode>", "Host mode: local (default) | remote", "local")
    .option("--ui <mode>", "UI mode: local (default) | remote", "local")
    .option("--api <mode>", "API mode: local (default) | remote", "local")
    .option("--proxy", "Proxy API requests to production")
    .option("-p, --port <port>", "Host port (default: from config)")
    .option("--no-interactive", "Disable interactive UI (streaming logs)")
    .action(async (options) => {
      const result = await client.dev({
        host: options.host as "local" | "remote",
        ui: options.ui as "local" | "remote",
        api: options.api as "local" | "remote",
        proxy: options.proxy || false,
        port: options.port ? parseInt(options.port, 10) : undefined,
        interactive: options.interactive,
      });

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} ${result.description}`));
        process.exit(1);
      }
    });

  program
    .command("start")
    .description("Start with production modules (all remotes from production URLs)")
    .option("-p, --port <port>", "Host port (default: 3000)")
    .option("--account <account>", "NEAR account to fetch config from social.near")
    .option("--domain <domain>", "Gateway domain for config lookup")
    .option("--no-interactive", "Disable interactive UI (streaming logs)")
    .action(async (options) => {
      const result = await client.start({
        port: options.port ? parseInt(options.port, 10) : undefined,
        account: options.account,
        domain: options.domain,
        interactive: options.interactive,
      });

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} Failed to start`));
        process.exit(1);
      }
    });

  program
    .command("serve")
    .description("Run CLI as HTTP server (exposes /api)")
    .option("-p, --port <port>", "Port to run on", "4000")
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      
      const { Hono } = await import("hono");
      const { cors } = await import("hono/cors");
      const { RPCHandler } = await import("@orpc/server/fetch");
      const { OpenAPIHandler } = await import("@orpc/openapi/fetch");
      const { OpenAPIReferencePlugin } = await import("@orpc/openapi/plugins");
      const { ZodToJsonSchemaConverter } = await import("@orpc/zod/zod4");
      const { onError } = await import("every-plugin/orpc");
      const { formatORPCError } = await import("every-plugin/errors");

      const app = new Hono();
      
      app.use("/*", cors({ origin: "*", credentials: true }));

      const rpcHandler = new RPCHandler(result.router, {
        interceptors: [onError((error: unknown) => formatORPCError(error))],
      });

      const apiHandler = new OpenAPIHandler(result.router, {
        plugins: [
          new OpenAPIReferencePlugin({
            schemaConverters: [new ZodToJsonSchemaConverter()],
            specGenerateOptions: {
              info: { title: "BOS CLI API", version: "1.0.0" },
              servers: [{ url: `http://localhost:${port}/api` }],
            },
          }),
        ],
        interceptors: [onError((error: unknown) => formatORPCError(error))],
      });

      app.get("/", (c) => c.json({ 
        ok: true, 
        plugin: "bos-cli", 
        status: "ready",
        endpoints: {
          health: "/",
          docs: "/api",
          rpc: "/api/rpc"
        }
      }));

      app.all("/api/rpc/*", async (c) => {
        const rpcResult = await rpcHandler.handle(c.req.raw, {
          prefix: "/api/rpc",
          context: {},
        });
        return rpcResult.response 
          ? new Response(rpcResult.response.body, rpcResult.response) 
          : c.text("Not Found", 404);
      });

      app.all("/api", async (c) => {
        const apiResult = await apiHandler.handle(c.req.raw, {
          prefix: "/api",
          context: {},
        });
        return apiResult.response 
          ? new Response(apiResult.response.body, apiResult.response) 
          : c.text("Not Found", 404);
      });

      app.all("/api/*", async (c) => {
        const apiResult = await apiHandler.handle(c.req.raw, {
          prefix: "/api",
          context: {},
        });
        return apiResult.response 
          ? new Response(apiResult.response.body, apiResult.response) 
          : c.text("Not Found", 404);
      });

      console.log();
      console.log(colors.cyan(frames.top(48)));
      console.log(`  ${icons.run} ${gradients.cyber("CLI SERVER")}`);
      console.log(colors.cyan(frames.bottom(48)));
      console.log();
      console.log(`  ${colors.dim("URL:")}  ${colors.white(`http://localhost:${port}`)}`);
      console.log(`  ${colors.dim("RPC:")}  ${colors.white(`http://localhost:${port}/api/rpc`)}`);
      console.log(`  ${colors.dim("Docs:")} ${colors.white(`http://localhost:${port}/api`)}`);
      console.log();

      const server = Bun.serve({
        port,
        fetch: app.fetch,
      });

      const shutdown = () => {
        console.log();
        console.log(colors.dim("  Shutting down..."));
        server.stop();
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      await new Promise(() => {});
    });

  program
    .command("build")
    .description(`Build packages locally (${packages.join(", ")})`)
    .argument("[packages]", "Packages to build (comma-separated: host,ui,api)", "all")
    .option("--force", "Force rebuild")
    .action(async (pkgs: string, options) => {
      console.log();
      console.log(`  ${icons.pkg} Building...`);

      const result = await client.build({
        packages: pkgs,
        force: options.force || false,
        deploy: false,
      });

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} Build failed`));
        process.exit(1);
      }

      console.log();
      console.log(colors.green(`${icons.ok} Built: ${result.built.join(", ")}`));
      console.log();
    });

  program
    .command("deploy")
    .description(`Build and deploy to Zephyr Cloud (${packages.join(", ")})`)
    .argument("[packages]", "Packages to deploy (comma-separated: host,ui,api)", "all")
    .option("--force", "Force rebuild")
    .addHelpText("after", `
Zephyr Configuration:
  Set ZE_SERVER_TOKEN and ZE_USER_EMAIL in .env.bos for CI/CD deployment.
  Docs: https://docs.zephyr-cloud.io/features/ci-cd-server-token
`)
    .action(async (pkgs: string, options) => {
      console.log();
      console.log(`  ${icons.pkg} Building & deploying...`);

      const result = await client.build({
        packages: pkgs,
        force: options.force || false,
        deploy: true,
      });

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} Deploy failed`));
        process.exit(1);
      }

      console.log();
      console.log(colors.green(`${icons.ok} Deployed: ${result.built.join(", ")}`));
      console.log(colors.dim(`  Deployed to Zephyr Cloud`));
      console.log();
    });

  program
    .command("publish")
    .description("Publish bos.config.json to on-chain registry (Near Social)")
    .option("--network <network>", "Network: mainnet | testnet", "mainnet")
    .option("--path <path>", "Near Social relative path", "bos.config.json")
    .option("--dry-run", "Show what would be published without sending")
    .action(async (options) => {
      console.log();
      console.log(`  ${icons.pkg} Publishing to Near Social...`);
      console.log(colors.dim(`  Account: ${config?.account}`));
      console.log(colors.dim(`  Network: ${options.network}`));

      if (options.dryRun) {
        console.log(colors.cyan(`  ${icons.scan} Dry run mode - no transaction will be sent`));
      }

      const result = await client.publish({
        network: options.network as "mainnet" | "testnet",
        path: options.path,
        dryRun: options.dryRun || false,
      });

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} Publish failed: ${result.error || "Unknown error"}`));
        process.exit(1);
      }

      if (result.status === "dry-run") {
        console.log();
        console.log(colors.cyan(`${icons.ok} Dry run complete`));
        console.log(`  ${colors.dim("Would publish to:")} ${result.registryUrl}`);
        console.log();
        return;
      }

      console.log();
      console.log(colors.green(`${icons.ok} Published!`));
      console.log(`  ${colors.dim("TX:")} ${result.txHash}`);
      console.log(`  ${colors.dim("URL:")} ${result.registryUrl}`);
      console.log();
    });

  program
    .command("clean")
    .description("Clean build artifacts")
    .action(async () => {
      const result = await client.clean({});

      console.log();
      console.log(colors.green(`${icons.ok} Cleaned: ${result.removed.join(", ")}`));
      console.log();
    });

  const create = program
    .command("create")
    .description("Scaffold new projects and remotes");

  create
    .command("project")
    .description("Create a new BOS project")
    .argument("<name>", "Project name")
    .option("-t, --template <url>", "Template URL")
    .action(async (name: string, options: { template?: string }) => {
      const result = await client.create({
        type: "project",
        name,
        template: options.template,
      });

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} Failed to create project`));
        process.exit(1);
      }

      console.log();
      console.log(colors.green(`${icons.ok} Created project at ${result.path}`));
      console.log();
      console.log(colors.dim("  Next steps:"));
      console.log(`  ${colors.dim("1.")} cd ${result.path}`);
      console.log(`  ${colors.dim("2.")} bun install`);
      console.log(`  ${colors.dim("3.")} bun bos dev`);
      console.log();
    });

  create
    .command("ui")
    .description("Scaffold a new UI remote")
    .option("-t, --template <url>", "Template URL")
    .action(async (options: { template?: string }) => {
      const result = await client.create({
        type: "ui",
        template: options.template,
      });

      if (result.status === "created") {
        console.log(colors.green(`${icons.ok} Created UI at ${result.path}`));
      }
    });

  create
    .command("api")
    .description("Scaffold a new API remote")
    .option("-t, --template <url>", "Template URL")
    .action(async (options: { template?: string }) => {
      const result = await client.create({
        type: "api",
        template: options.template,
      });

      if (result.status === "created") {
        console.log(colors.green(`${icons.ok} Created API at ${result.path}`));
      }
    });

  create
    .command("host")
    .description("Scaffold a new host")
    .option("-t, --template <url>", "Template URL")
    .action(async (options: { template?: string }) => {
      const result = await client.create({
        type: "host",
        template: options.template,
      });

      if (result.status === "created") {
        console.log(colors.green(`${icons.ok} Created host at ${result.path}`));
      }
    });

  create
    .command("cli")
    .description("Scaffold a new CLI")
    .option("-t, --template <url>", "Template URL")
    .action(async (options: { template?: string }) => {
      const result = await client.create({
        type: "cli",
        template: options.template,
      });

      if (result.status === "created") {
        console.log(colors.green(`${icons.ok} Created CLI at ${result.path}`));
      }
    });

  create
    .command("gateway")
    .description("Scaffold a new gateway")
    .option("-t, --template <url>", "Template URL")
    .action(async (options: { template?: string }) => {
      const result = await client.create({
        type: "gateway",
        template: options.template,
      });

      if (result.status === "created") {
        console.log(colors.green(`${icons.ok} Created gateway at ${result.path}`));
      }
    });

  const gateway = program
    .command("gateway")
    .description("Manage gateway deployment");

  gateway
    .command("dev")
    .description("Run gateway locally (wrangler dev)")
    .action(async () => {
      console.log();
      console.log(`  ${icons.run} Starting gateway dev server...`);

      const result = await client.gatewayDev({});

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} ${result.error || "Failed to start gateway"}`));
        process.exit(1);
      }

      console.log();
      console.log(colors.green(`${icons.ok} Gateway running at ${result.url}`));
      console.log();
    });

  gateway
    .command("deploy")
    .description("Deploy gateway to Cloudflare")
    .option("-e, --env <env>", "Environment (production | staging)")
    .action(async (options: { env?: string }) => {
      console.log();
      console.log(`  ${icons.pkg} Deploying gateway...`);
      if (options.env) {
        console.log(colors.dim(`  Environment: ${options.env}`));
      }

      const result = await client.gatewayDeploy({
        env: options.env as "production" | "staging" | undefined,
      });

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} ${result.error || "Deploy failed"}`));
        process.exit(1);
      }

      console.log();
      console.log(colors.green(`${icons.ok} Deployed!`));
      console.log(`  ${colors.dim("URL:")} ${result.url}`);
      console.log();
    });

  gateway
    .command("sync")
    .description("Sync wrangler.toml vars from bos.config.json")
    .action(async () => {
      console.log();
      console.log(`  ${icons.pkg} Syncing gateway config...`);

      const result = await client.gatewaySync({});

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} ${result.error || "Sync failed"}`));
        process.exit(1);
      }

      console.log();
      console.log(colors.green(`${icons.ok} Synced!`));
      console.log(`  ${colors.dim("GATEWAY_DOMAIN:")} ${result.gatewayDomain}`);
      console.log(`  ${colors.dim("GATEWAY_ACCOUNT:")} ${result.gatewayAccount}`);
      console.log();
    });

  program
    .command("register")
    .description("Register a new tenant on the gateway")
    .argument("<name>", `Account name (will create <name>.${config?.account})`)
    .option("--network <network>", "Network: mainnet | testnet", "mainnet")
    .action(async (name: string, options: { network: string }) => {
      console.log();
      console.log(`  ${icons.pkg} Registering ${name}...`);

      const result = await client.register({
        name,
        network: options.network as "mainnet" | "testnet",
      });

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} Registration failed: ${result.error || "Unknown error"}`));
        process.exit(1);
      }

      console.log();
      console.log(colors.green(`${icons.ok} Registered!`));
      console.log(`  ${colors.dim("Account:")} ${result.account}`);
      if (result.novaGroup) {
        console.log(`  ${colors.dim("NOVA Group:")} ${result.novaGroup}`);
      }
      console.log();
      console.log(colors.dim("  Next steps:"));
      console.log(`  ${colors.dim("1.")} Update bos.config.json with account: "${result.account}"`);
      console.log(`  ${colors.dim("2.")} bos secrets sync --env .env.local`);
      console.log(`  ${colors.dim("3.")} bos publish`);
      console.log();
    });

  const secrets = program
    .command("secrets")
    .description("Manage encrypted secrets via NOVA");

  secrets
    .command("sync")
    .description("Sync secrets from .env file to NOVA")
    .option("--env <path>", "Path to .env file", ".env.local")
    .action(async (options: { env: string }) => {
      console.log();
      console.log(`  ${icons.pkg} Syncing secrets from ${options.env}...`);

      const result = await client.secretsSync({
        envPath: options.env,
      });

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} Sync failed: ${result.error || "Unknown error"}`));
        process.exit(1);
      }

      console.log();
      console.log(colors.green(`${icons.ok} Synced ${result.count} secrets`));
      if (result.cid) {
        console.log(`  ${colors.dim("CID:")} ${result.cid}`);
      }
      console.log();
    });

  secrets
    .command("set")
    .description("Set a single secret")
    .argument("<key=value>", "Secret key=value pair")
    .action(async (keyValue: string) => {
      const eqIndex = keyValue.indexOf("=");
      if (eqIndex === -1) {
        console.error(colors.error(`${icons.err} Invalid format. Use: bos secrets set KEY=value`));
        process.exit(1);
      }

      const key = keyValue.slice(0, eqIndex);
      const value = keyValue.slice(eqIndex + 1);

      console.log();
      console.log(`  ${icons.pkg} Setting secret ${key}...`);

      const result = await client.secretsSet({ key, value });

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} Failed: ${result.error || "Unknown error"}`));
        process.exit(1);
      }

      console.log();
      console.log(colors.green(`${icons.ok} Secret set`));
      if (result.cid) {
        console.log(`  ${colors.dim("CID:")} ${result.cid}`);
      }
      console.log();
    });

  secrets
    .command("list")
    .description("List secret keys (not values)")
    .action(async () => {
      const result = await client.secretsList({});

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} Failed: ${result.error || "Unknown error"}`));
        process.exit(1);
      }

      console.log();
      console.log(colors.cyan(frames.top(48)));
      console.log(`  ${icons.config} ${gradients.cyber("SECRETS")}`);
      console.log(colors.cyan(frames.bottom(48)));
      console.log();

      if (result.keys.length === 0) {
        console.log(colors.dim("  No secrets configured"));
      } else {
        for (const key of result.keys) {
          console.log(`  ${colors.dim("•")} ${key}`);
        }
      }
      console.log();
    });

  secrets
    .command("delete")
    .description("Delete a secret")
    .argument("<key>", "Secret key to delete")
    .action(async (key: string) => {
      console.log();
      console.log(`  ${icons.pkg} Deleting secret ${key}...`);

      const result = await client.secretsDelete({ key });

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} Failed: ${result.error || "Unknown error"}`));
        process.exit(1);
      }

      console.log();
      console.log(colors.green(`${icons.ok} Secret deleted`));
      console.log();
    });

  program
    .command("sync")
    .description("Sync dependencies and config from published bos.config.json")
    .option("--account <account>", "NEAR account to sync from (default: from config)")
    .option("--gateway <gateway>", "Gateway domain to sync from (default: from config)")
    .option("--network <network>", "Network: mainnet | testnet", "mainnet")
    .option("--force", "Force sync even if versions match")
    .option("--files", "Also sync template files (tsconfig, etc.)")
    .action(async (options: { account?: string; gateway?: string; network?: string; force?: boolean; files?: boolean }) => {
      console.log();
      const gateway = config?.gateway as { production?: string } | undefined;
      const gatewayDomain = gateway?.production?.replace(/^https?:\/\//, "") || "everything.dev";
      const source = `${options.account || config?.account || "every.near"}/${options.gateway || gatewayDomain}`;

      const s = spinner();
      s.start(`Syncing from ${source}...`);

      const result = await client.sync({
        account: options.account,
        gateway: options.gateway,
        network: (options.network as "mainnet" | "testnet") || "mainnet",
        force: options.force || false,
        files: options.files || false,
      });

      if (result.status === "error") {
        s.stop(colors.error(`${icons.err} Sync failed: ${result.error || "Unknown error"}`));
        process.exit(1);
      }

      s.stop(colors.green(`${icons.ok} Synced from ${source}`));

      console.log();
      console.log(colors.cyan(frames.top(52)));
      console.log(`  ${icons.ok} ${gradients.cyber("SYNCED")}`);
      console.log(colors.cyan(frames.bottom(52)));
      console.log();
      console.log(`  ${colors.dim("Source:")}   ${colors.cyan(`${result.account}/${result.gateway}`)}`);
      console.log(`  ${colors.dim("URL:")}      ${colors.cyan(result.socialUrl)}`);
      console.log(`  ${colors.dim("Host URL:")} ${colors.cyan(result.hostUrl)}`);
      console.log();
      
      if (result.catalogUpdated) {
        console.log(colors.green(`  ${icons.ok} Updated root package.json catalog`));
      }
      
      if (result.packagesUpdated.length > 0) {
        console.log(colors.green(`  ${icons.ok} Updated packages: ${result.packagesUpdated.join(", ")}`));
      }

      if (result.filesSynced && result.filesSynced.length > 0) {
        const totalFiles = result.filesSynced.reduce((sum, pkg) => sum + pkg.files.length, 0);
        console.log(colors.green(`  ${icons.ok} Synced ${totalFiles} files`));
        for (const pkg of result.filesSynced) {
          console.log(colors.dim(`    ${pkg.package}: ${pkg.files.join(", ")}`));
        }
      }

      if (!result.catalogUpdated && result.packagesUpdated.length === 0 && (!result.filesSynced || result.filesSynced.length === 0)) {
        console.log(colors.dim(`  ${icons.ok} Already up to date`));
      }
      
      console.log();
      console.log(colors.dim("  Run 'bun install' to update lockfile"));
      console.log();
    });

  const depsCmd = program
    .command("deps")
    .description("Manage shared dependencies");

  depsCmd
    .command("update")
    .description("Interactive update of shared dependencies (bun update -i style)")
    .argument("[category]", "Dependency category (ui | api)", "ui")
    .action(async (category: string) => {
      console.log();
      console.log(`  ${icons.pkg} Updating shared.${category} dependencies...`);

      const result = await client.depsUpdate({
        category: category as "ui" | "api",
      });

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} ${result.error || "Update failed"}`));
        process.exit(1);
      }

      if (result.status === "cancelled") {
        console.log();
        console.log(colors.dim("  No updates selected"));
        console.log();
        return;
      }

      console.log();
      console.log(colors.cyan(frames.top(52)));
      console.log(`  ${icons.ok} ${gradients.cyber("DEPENDENCIES UPDATED")}`);
      console.log(colors.cyan(frames.bottom(52)));
      console.log();

      for (const { name, from, to } of result.updated) {
        console.log(`  ${colors.dim("•")} ${colors.white(name)}`);
        console.log(`    ${colors.dim(from)} → ${colors.green(to)}`);
      }

      if (result.syncStatus === "synced") {
        console.log();
        console.log(colors.green(`  ${icons.ok} Catalog synced & bun install complete`));
      }
      console.log();
    });

  program
    .command("kill")
    .description("Kill all tracked BOS processes")
    .option("--force", "Force kill with SIGKILL immediately")
    .action(async (options: { force?: boolean }) => {
      const result = await client.kill({ force: options.force ?? false });

      console.log();
      if (result.status === "error") {
        console.error(colors.error(`${icons.err} ${result.error || "Failed to kill processes"}`));
        process.exit(1);
      }

      if (result.killed.length > 0) {
        console.log(colors.green(`${icons.ok} Killed ${result.killed.length} processes`));
        for (const pid of result.killed) {
          console.log(colors.dim(`  PID ${pid}`));
        }
      }
      if (result.failed.length > 0) {
        console.log(colors.error(`${icons.err} Failed to kill ${result.failed.length} processes`));
        for (const pid of result.failed) {
          console.log(colors.dim(`  PID ${pid}`));
        }
      }
      if (result.killed.length === 0 && result.failed.length === 0) {
        console.log(colors.dim("  No tracked processes found"));
      }
      console.log();
    });

  program
    .command("ps")
    .description("List tracked BOS processes")
    .action(async () => {
      const result = await client.ps({});

      console.log();
      console.log(colors.cyan(frames.top(52)));
      console.log(`  ${icons.run} ${gradients.cyber("PROCESSES")}`);
      console.log(colors.cyan(frames.bottom(52)));
      console.log();

      if (result.processes.length === 0) {
        console.log(colors.dim("  No tracked processes"));
      } else {
        for (const proc of result.processes) {
          const age = Math.round((Date.now() - proc.startedAt) / 1000);
          console.log(`  ${colors.white(proc.name)} ${colors.dim(`(PID ${proc.pid})`)}`);
          console.log(`    ${colors.dim("Port:")} ${colors.cyan(String(proc.port))}`);
          console.log(`    ${colors.dim("Age:")} ${colors.cyan(`${age}s`)}`);
        }
      }
      console.log();
    });

  const docker = program
    .command("docker")
    .description("Docker container management");

  docker
    .command("build")
    .description("Build Docker image")
    .option("-t, --target <target>", "Build target: production | development", "production")
    .option("--tag <tag>", "Custom image tag")
    .option("--no-cache", "Build without cache")
    .action(async (options: { target: string; tag?: string; noCache?: boolean }) => {
      console.log();
      console.log(`  ${icons.pkg} Building Docker image (${options.target})...`);

      const result = await client.dockerBuild({
        target: options.target as "production" | "development",
        tag: options.tag,
        noCache: options.noCache ?? false,
      });

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} ${result.error || "Build failed"}`));
        process.exit(1);
      }

      console.log();
      console.log(colors.green(`${icons.ok} Built ${result.tag}`));
      console.log();
    });

  docker
    .command("run")
    .description("Run Docker container")
    .option("-t, --target <target>", "Image target: production | development", "production")
    .option("-m, --mode <mode>", "Run mode: start | serve | dev", "start")
    .option("-p, --port <port>", "Port to expose")
    .option("-d, --detach", "Run in background")
    .option("-e, --env <env...>", "Environment variables (KEY=value)")
    .action(async (options: { target: string; mode: string; port?: string; detach?: boolean; env?: string[] }) => {
      console.log();
      console.log(`  ${icons.run} Starting Docker container...`);

      const envVars: Record<string, string> = {};
      if (options.env) {
        for (const e of options.env) {
          const [key, ...rest] = e.split("=");
          if (key) envVars[key] = rest.join("=");
        }
      }

      const result = await client.dockerRun({
        target: options.target as "production" | "development",
        mode: options.mode as "start" | "serve" | "dev",
        port: options.port ? parseInt(options.port, 10) : undefined,
        detach: options.detach ?? false,
        env: Object.keys(envVars).length > 0 ? envVars : undefined,
      });

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} ${result.error || "Run failed"}`));
        process.exit(1);
      }

      console.log();
      console.log(colors.green(`${icons.ok} Container running`));
      console.log(`  ${colors.dim("URL:")} ${colors.cyan(result.url)}`);
      if (result.containerId !== "attached") {
        console.log(`  ${colors.dim("Container:")} ${colors.cyan(result.containerId)}`);
      }
      console.log();
    });

  docker
    .command("stop")
    .description("Stop Docker container(s)")
    .option("-c, --container <id>", "Container ID to stop")
    .option("-a, --all", "Stop all containers for this app")
    .action(async (options: { container?: string; all?: boolean }) => {
      console.log();
      console.log(`  ${icons.pkg} Stopping containers...`);

      const result = await client.dockerStop({
        containerId: options.container,
        all: options.all ?? false,
      });

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} ${result.error || "Stop failed"}`));
        process.exit(1);
      }

      console.log();
      if (result.stopped.length > 0) {
        console.log(colors.green(`${icons.ok} Stopped ${result.stopped.length} container(s)`));
        for (const id of result.stopped) {
          console.log(colors.dim(`  ${id}`));
        }
      } else {
        console.log(colors.dim("  No containers stopped"));
      }
      console.log();
    });

  program
    .command("login")
    .description("Login to NOVA for encrypted secrets management")
    .action(async () => {
      const { default: open } = await import("open");
      const { password, input } = await import("@inquirer/prompts");

      console.log();
      console.log(colors.cyan(frames.top(52)));
      console.log(`  ${icons.config} ${gradients.cyber("NOVA LOGIN")}`);
      console.log(colors.cyan(frames.bottom(52)));
      console.log();
      console.log(colors.dim("  NOVA provides encrypted secrets storage for your plugins."));
      console.log();
      console.log(colors.white("  To get your credentials:"));
      console.log(colors.dim("  1. Login at nova-sdk.com"));
      console.log(colors.dim("  2. Copy your account ID and session token from your profile"));
      console.log();

      try {
        const shouldOpen = await input({
          message: "Press Enter to open nova-sdk.com (or 'skip')",
          default: "",
        });

        if (shouldOpen !== "skip") {
          await open("https://nova-sdk.com");
          console.log();
          console.log(colors.dim("  Browser opened. Login and copy your credentials..."));
          console.log();
        }

        const accountId = await input({
          message: "Account ID (e.g., alice.nova-sdk.near):",
          validate: (value: string) => {
            if (!value.trim()) return "Account ID is required";
            if (!value.includes(".")) return "Invalid account ID format";
            return true;
          },
        });

        const sessionToken = await input({
          message: "Session Token (paste the full token):",
          validate: (value: string) => {
            if (!value.trim()) return "Session token is required";
            if (value.length < 50) return "Token seems too short";
            return true;
          },
        });

        console.log();
        console.log(`  ${icons.pkg} Verifying credentials...`);
        console.log(colors.dim(`  Token length: ${sessionToken.length} characters`));

        const result = await client.login({
          accountId: accountId.trim(),
          token: sessionToken.trim(),
        });

        if (result.status === "error") {
          console.error(colors.error(`${icons.err} Login failed: ${result.error || "Unknown error"}`));
          process.exit(1);
        }

        console.log();
        console.log(colors.green(`${icons.ok} Logged in!`));
        console.log(`  ${colors.dim("Account:")} ${result.accountId}`);
        console.log(`  ${colors.dim("Saved to:")} .env.bos`);
        console.log();
        console.log(colors.dim("  You can now use 'bos register' and 'bos secrets' commands."));
        console.log();
      } catch (error) {
        if (error instanceof Error && error.name === "ExitPromptError") {
          console.log();
          console.log(colors.dim("  Login cancelled."));
          console.log();
          process.exit(0);
        }
        throw error;
      }
    });

  program
    .command("logout")
    .description("Logout from NOVA (removes credentials from .env.bos)")
    .action(async () => {
      console.log();
      console.log(`  ${icons.pkg} Logging out...`);

      const result = await client.logout({});

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} Logout failed: ${result.error || "Unknown error"}`));
        process.exit(1);
      }

      console.log();
      console.log(colors.green(`${icons.ok} Logged out`));
      console.log(colors.dim("  NOVA credentials removed from .env.bos"));
      console.log();
    });

  program.parse();
}

main().catch((error) => {
  console.error(colors.error(`${icons.err} Fatal error:`), error);
  process.exit(1);
});

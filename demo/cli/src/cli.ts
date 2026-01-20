#!/usr/bin/env bun
import { program } from "commander";
import { createPluginRuntime } from "every-plugin";
import { getConfigPath, getPackages, getTitle, loadConfig } from "./config";
import BosPlugin from "./plugin";
import { printBanner } from "./utils/banner";
import { colors, frames, gradients, icons } from "./utils/theme";

async function main() {
  let config: ReturnType<typeof loadConfig>;

  try {
    config = loadConfig();
  } catch {
    console.error(colors.error(`${icons.err} Could not find bos.config.json`));
    console.log(colors.dim("  Run 'bos create project <name>' to create a new project"));
    process.exit(1);
  }

  const packages = getPackages();
  const title = getTitle();
  const configPath = getConfigPath();

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

  function getHelpHeader(): string {
    const host = config.app.host;
    const lines: string[] = [];

    lines.push("");
    lines.push(colors.cyan(frames.top(52)));
    lines.push(`  ${icons.config} ${gradients.cyber("BOS CLI")} ${colors.dim("v1.0.0")}`);
    lines.push(colors.cyan(frames.bottom(52)));
    lines.push("");
    lines.push(`  ${colors.dim("Account")} ${colors.cyan(config.account)}`);
    lines.push(`  ${colors.dim("URL    ")} ${colors.white(host.production)}`);
    lines.push(`  ${colors.dim("Config ")} ${colors.dim(configPath)}`);
    if (host.description) {
      lines.push(`  ${colors.dim("About  ")} ${colors.white(host.description)}`);
    }
    lines.push("");
    lines.push(colors.cyan(frames.top(52)));
    lines.push("");

    return lines.join("\n");
  }

  program
    .name("bos")
    .version("1.0.0")
    .addHelpText("before", getHelpHeader());

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
      if (host.remote) {
        console.log(`  ${colors.magenta("│")} ${colors.dim("remote")}       ${colors.blue(host.remote)}`);
      }
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
    .option("-p, --port <port>", "Host port (default: from config)")
    .option("--no-interactive", "Disable interactive UI (streaming logs)")
    .action(async (options) => {
      const result = await client.start({
        port: options.port ? parseInt(options.port, 10) : undefined,
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
      const result = await client.serve({
        port: parseInt(options.port, 10),
      });

      console.log();
      console.log(colors.cyan(frames.top(48)));
      console.log(`  ${icons.run} ${gradients.cyber("CLI SERVER")}`);
      console.log(colors.cyan(frames.bottom(48)));
      console.log();
      console.log(`  ${colors.dim("URL:")}  ${colors.white(result.url)}`);
      console.log(`  ${colors.dim("RPC:")}  ${colors.white(result.endpoints.rpc)}`);
      console.log(`  ${colors.dim("Docs:")} ${colors.white(result.endpoints.docs)}`);
      console.log();
    });

  program
    .command("build")
    .description(`Build packages (${packages.join(", ")}). Deploys to Zephyr Cloud by default.`)
    .argument("[package]", "Package to build", "all")
    .option("--force", "Force rebuild")
    .option("--no-deploy", "Build locally without Zephyr deploy")
    .addHelpText("after", `
Zephyr Configuration:
  Set ZE_SERVER_TOKEN and ZE_USER_EMAIL in .env.bos for CI/CD deployment.
  Docs: https://docs.zephyr-cloud.io/features/ci-cd-server-token
`)
    .action(async (pkg: string, options) => {
      console.log();
      console.log(`  ${icons.pkg} Building${options.deploy ? " & deploying" : ""}...`);

      const result = await client.build({
        package: pkg,
        force: options.force || false,
        deploy: options.deploy !== false,
      });

      if (result.status === "error") {
        console.error(colors.error(`${icons.err} Build failed`));
        process.exit(1);
      }

      console.log();
      console.log(colors.green(`${icons.ok} Built: ${result.built.join(", ")}`));
      if (result.deployed) {
        console.log(colors.dim(`  Deployed to Zephyr Cloud`));
      }
      console.log();
    });

  program
    .command("publish")
    .description("Publish bos.config.json to on-chain registry (FastFS)")
    .option("--sign-with <method>", "Signing method: keychain | ledger | seed-phrase | access-key-file")
    .option("--network <network>", "Network: mainnet | testnet", "mainnet")
    .option("--path <path>", "FastFS relative path", "bos.config.json")
    .option("--dry-run", "Show what would be published without sending")
    .action(async (options) => {
      console.log();
      console.log(`  ${icons.pkg} Publishing to FastFS...`);
      console.log(colors.dim(`  Account: ${config.account}`));
      console.log(colors.dim(`  Network: ${options.network}`));

      if (options.dryRun) {
        console.log(colors.cyan(`  ${icons.scan} Dry run mode - no transaction will be sent`));
      }

      const result = await client.publish({
        signWith: options.signWith as any,
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

  program.parse();
}

main().catch((error) => {
  console.error(colors.error(`${icons.err} Fatal error:`), error);
  process.exit(1);
});

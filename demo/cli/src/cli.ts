#!/usr/bin/env bun
import { program } from "commander";
import { createPluginRuntime } from "every-plugin";
import { getPackages, getTitle, loadConfig } from "./config";
import BosPlugin from "./plugin";
import { printBanner } from "./utils/banner";
import { colors, gradients, icons } from "./utils/theme";

async function main() {
  let config: ReturnType<typeof loadConfig>;

  try {
    config = loadConfig();
  } catch {
    console.error(colors.magenta(`${icons.err} Could not find bos.config.json`));
    console.log(colors.dim("  Run 'bos create project <name>' to create a new project"));
    process.exit(1);
  }

  const packages = getPackages();
  const title = getTitle();

  printBanner(title);

  const runtime = createPluginRuntime({
    registry: {
      "bos-cli": { module: BosPlugin }
    },
    secrets: {
      NEAR_PRIVATE_KEY: process.env.NEAR_PRIVATE_KEY || "",
    }
  });

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
    lines.push(colors.cyan(`+${"-".repeat(50)}+`));
    lines.push(`  ${icons.config} ${gradients.cyber("BOS CLI")} ${colors.dim("v1.0.0")}`);
    lines.push(colors.cyan(`+${"-".repeat(50)}+`));
    lines.push("");
    lines.push(`  ${colors.dim("Account")} ${colors.cyan(config.account)}`);
    lines.push(`  ${colors.dim("URL    ")} ${colors.white(host.production)}`);
    if (host.description) {
      lines.push(`  ${colors.dim("About  ")} ${colors.white(host.description)}`);
    }
    lines.push("");
    lines.push(colors.cyan(`+${"-".repeat(50)}+`));
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
      console.log(colors.cyan(`+${"-".repeat(46)}+`));
      console.log(`  ${icons.config} ${gradients.cyber("CONFIGURATION")}`);
      console.log(colors.cyan(`+${"-".repeat(46)}+`));
      console.log();
      console.log(colors.white("  Account:"), colors.cyan(result.config.account));
      console.log(colors.white("  Packages:"), colors.cyan(result.packages.join(", ")));
      console.log(colors.white("  Remotes:"), colors.cyan(result.remotes.join(", ")));
      console.log();
    });

  program
    .command("status")
    .description("Check remote health")
    .option("-e, --env <env>", "Environment (development | production)", "development")
    .action(async (options: { env: string }) => {
      const result = await client.status({ env: options.env as "development" | "production" });

      console.log();
      console.log(colors.cyan(`+${"-".repeat(46)}+`));
      console.log(`  ${icons.scan} ${gradients.cyber("ENDPOINT STATUS")}`);
      console.log(colors.cyan(`+${"-".repeat(46)}+`));
      console.log();

      for (const endpoint of result.endpoints) {
        const status = endpoint.healthy
          ? colors.neonGreen(`${icons.ok} healthy`)
          : colors.magenta(`${icons.err} unhealthy`);
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
    .action(async (options) => {
      const result = await client.dev({
        host: options.host as "local" | "remote",
        ui: options.ui as "local" | "remote",
        api: options.api as "local" | "remote",
        proxy: options.proxy || false,
      });

      if (result.status === "error") {
        console.error(colors.magenta(`${icons.err} ${result.description}`));
        process.exit(1);
      }
    });

  program
    .command("start")
    .description("Start production server")
    .option("-p, --port <port>", "Port to run on", "3001")
    .action(async (options) => {
      const result = await client.start({
        port: parseInt(options.port, 10),
      });

      console.log();
      console.log(colors.neonGreen(`${icons.ok} Production server: ${result.url}`));
      console.log();
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
      console.log(colors.cyan(`+${"-".repeat(46)}+`));
      console.log(`  ${icons.run} ${gradients.cyber("CLI SERVER")}`);
      console.log(colors.cyan(`+${"-".repeat(46)}+`));
      console.log();
      console.log(`  ${colors.dim("URL:")}  ${colors.white(result.url)}`);
      console.log(`  ${colors.dim("RPC:")}  ${colors.white(result.endpoints.rpc)}`);
      console.log(`  ${colors.dim("Docs:")} ${colors.white(result.endpoints.docs)}`);
      console.log();
    });

  program
    .command("build")
    .description(`Build packages (${packages.join(", ")})`)
    .argument("[package]", "Package to build", "all")
    .option("--force", "Force rebuild")
    .action(async (pkg: string, options) => {
      const result = await client.build({
        package: pkg,
        force: options.force || false,
      });

      if (result.status === "error") {
        console.error(colors.magenta(`${icons.err} Build failed`));
        process.exit(1);
      }

      console.log();
      console.log(colors.neonGreen(`${icons.ok} Built: ${result.built.join(", ")}`));
      console.log();
    });

  program
    .command("publish")
    .description("Publish bos.config.json to on-chain registry")
    .action(async () => {
      console.log();
      console.log(`  ${icons.pkg} Publishing to FastFS...`);

      const result = await client.publish({});

      if (result.status === "error") {
        console.error(colors.magenta(`${icons.err} Publish failed. Did you set NEAR_PRIVATE_KEY?`));
        process.exit(1);
      }

      console.log();
      console.log(colors.neonGreen(`${icons.ok} Published!`));
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
      console.log(colors.neonGreen(`${icons.ok} Cleaned: ${result.removed.join(", ")}`));
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
        console.error(colors.magenta(`${icons.err} Failed to create project`));
        process.exit(1);
      }

      console.log();
      console.log(colors.neonGreen(`${icons.ok} Created project at ${result.path}`));
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
        console.log(colors.neonGreen(`${icons.ok} Created UI at ${result.path}`));
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
        console.log(colors.neonGreen(`${icons.ok} Created API at ${result.path}`));
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
        console.log(colors.neonGreen(`${icons.ok} Created host at ${result.path}`));
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
        console.log(colors.neonGreen(`${icons.ok} Created CLI at ${result.path}`));
      }
    });

  program.parse();
}

main().catch((error) => {
  console.error(colors.magenta(`${icons.err} Fatal error:`), error);
  process.exit(1);
});

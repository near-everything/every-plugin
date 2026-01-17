#!/usr/bin/env bun
import { program } from "commander";
import { printBanner } from "./utils/banner";
import { loadConfig, getPackages, getRemotes, getTitle, getAccount } from "./config";
import { infoCommand } from "./commands/info";
import { statusCommand } from "./commands/status";
import { devCommand } from "./commands/dev";
import { buildCommand } from "./commands/build";
import { testCommand } from "./commands/test";
import { dbCommand } from "./commands/db";
import { cleanCommand } from "./commands/clean";
import { createCommand } from "./commands/create";
import { logsCommand } from "./commands/logs";
import { colors, gradients, icons } from "./utils/theme";

function getHelpHeader(): string {
  const config = loadConfig();
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

try {
  loadConfig();
} catch {
  console.error("Error: Could not find bos.config.json");
  process.exit(1);
}

const packages = getPackages();
const title = getTitle();

printBanner(title);

program
  .name("bos")
  .version("1.0.0")
  .addHelpText("before", getHelpHeader());

program
  .command("info")
  .description("Show current configuration")
  .action(() => infoCommand());

program
  .command("status")
  .description("Check remote health")
  .option("-e, --env <env>", "Environment (development | production)", "development")
  .action((options: { env: string }) =>
    statusCommand({ env: options.env as "development" | "production" })
  );

program
  .command("dev")
  .description(`Start development (${packages.join(", ")})`)
  .option("--ui", "UI development (remote API)")
  .option("--api", "API development (remote UI)")
  .option("--host", "Host only (all remote)")
  .option("--proxy", "Proxy mode (proxy API to remote)")
  .action(devCommand);

program
  .command("build")
  .description(`Build packages (${packages.join(", ")})`)
  .argument("[package]", "Package to build", "all")
  .option("--force", "Force rebuild")
  .action(buildCommand);

program
  .command("test")
  .description("Run tests")
  .option("-f, --filter <package>", `Filter by package (${packages.join(", ")})`, "all")
  .action(testCommand);

program
  .command("db")
  .description("Database operations")
  .argument("<action>", "migrate | studio | generate | push | sync")
  .option("-f, --filter <package>", "Target package", "host")
  .action(dbCommand);

program
  .command("clean")
  .description("Clean build artifacts")
  .action(cleanCommand);

program
  .command("logs")
  .description("View dev session logs")
  .option("-n, --lines <count>", "Number of lines to show", "50")
  .option("-c, --copy", "Copy logs to clipboard")
  .option("-f, --file <name>", "Specific log file or 'list' to see all")
  .action((options: { lines?: string; copy?: boolean; file?: string }) =>
    logsCommand({
      lines: options.lines ? parseInt(options.lines, 10) : undefined,
      copy: options.copy,
      file: options.file,
    })
  );

const create = program
  .command("create")
  .description("Scaffold new projects and remotes");

create
  .command("project")
  .description("Create a new BOS project")
  .argument("<name>", "Project name")
  .option("-t, --template <url>", "Template URL", "near-everything/every-plugin/demo")
  .action((name: string, options: { template: string }) =>
    createCommand("project", name, options.template)
  );

create
  .command("ui")
  .description("Scaffold a new UI remote")
  .option("-t, --template <url>", "Template URL")
  .action((options: { template?: string }) =>
    createCommand("ui", undefined, options.template)
  );

create
  .command("api")
  .description("Scaffold a new API remote")
  .option("-t, --template <url>", "Template URL")
  .action((options: { template?: string }) =>
    createCommand("api", undefined, options.template)
  );

create
  .command("host")
  .description("Scaffold a new host")
  .option("-t, --template <url>", "Template URL")
  .action((options: { template?: string }) =>
    createCommand("host", undefined, options.template)
  );

program.parse();

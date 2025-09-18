import { Command } from "commander";
import { create } from "./commands/create.js";
import { register } from "./commands/register.js";
import { validate } from "./commands/validate.js";
import { getPackageInfo } from "./utils/get-package-info.js";

// Handle exit gracefully
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

async function main() {
  const program = new Command("every-plugin");

  let packageInfo: Record<string, any> = {};
  try {
    packageInfo = getPackageInfo();
  } catch (error) {
    // Continue without package info if we can't read it
  }

  program
    .addCommand(create)
    .addCommand(validate)
    .addCommand(register)
    .version(packageInfo.version || "0.1.0")
    .description("CLI for managing every-plugin development lifecycle")
    .action(() => program.help());

  program.parse();
}

main().catch((error) => {
  console.error("Error running every-plugin CLI:", error);
  process.exit(1);
});

import { Command } from "commander";
import { intro, outro } from "@clack/prompts";
import chalk from "chalk";
import { validatePlugin, formatValidationResults } from "../utils/plugin-validation.js";

async function validatePluginCommand(
  pluginPath: string, 
  options: { verbose?: boolean; cwd?: string }
) {
  intro(chalk.cyan("🔍 Validating every-plugin"));

  try {
    const results = await validatePlugin(pluginPath, {
      cwd: options.cwd,
      verbose: options.verbose
    });

    const formattedResults = formatValidationResults(results, {
      verbose: options.verbose
    });

    console.log(formattedResults);

    if (results.overall) {
      outro(chalk.green("✅ Plugin validation passed"));
      process.exit(0);
    } else {
      outro(chalk.red("❌ Plugin validation failed"));
      process.exit(1);
    }
  } catch (error) {
    outro(chalk.red(`Error during validation: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

export const validate = new Command("validate")
  .description("Validate plugin compatibility and configuration")
  .argument("<plugin-path>", "Path to the plugin directory")
  .option("-v, --verbose", "Show detailed validation information")
  .option("--cwd <cwd>", "The working directory", process.cwd())
  .action(validatePluginCommand);

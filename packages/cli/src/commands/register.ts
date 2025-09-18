import { Command } from "commander";
import { intro, outro, confirm, spinner } from "@clack/prompts";
import chalk from "chalk";
import { resolve, join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { validatePlugin, formatValidationResults } from "../utils/plugin-validation.js";

interface RegistryEntry {
  name: string;
  version: string;
  description: string;
  author?: string;
  repository?: string;
  keywords?: string[];
  peerDependencies?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

async function registerPlugin(pluginPath: string, options: { registry?: string }) {
  intro(chalk.cyan("📦 Registering every-plugin"));

  // Validate plugin using shared validation utility
  const s = spinner();
  s.start("Validating plugin...");

  try {
    const validationResults = await validatePlugin(pluginPath, {
      cwd: options.registry || process.cwd()
    });

    if (!validationResults.overall) {
      s.stop("Validation failed");
      console.log(formatValidationResults(validationResults));
      outro(chalk.red("❌ Plugin validation failed. Please fix the issues above before registering."));
      return;
    }

    s.stop("Plugin validated successfully");

    // Show plugin info from validation results
    if (validationResults.pluginInfo) {
      console.log(chalk.gray("\nPlugin Information:"));
      console.log(chalk.gray(`  Name: ${validationResults.pluginInfo.name}`));
      console.log(chalk.gray(`  Version: ${validationResults.pluginInfo.version}`));
      console.log(chalk.gray(`  Description: ${validationResults.pluginInfo.description || "No description"}`));
    }

    // Confirm registration
    const shouldRegister = await confirm({
      message: "Register this plugin?",
      initialValue: true
    });

    if (!shouldRegister) {
      outro(chalk.yellow("Registration cancelled"));
      return;
    }

    // Find registry file
    s.start("Updating registry...");
    
    const registryPath = resolve(process.cwd(), "packages/registry/registry.json");
    let registry: { plugins: RegistryEntry[] } = { plugins: [] };

    if (existsSync(registryPath)) {
      try {
        registry = JSON.parse(readFileSync(registryPath, "utf8"));
      } catch (error) {
        s.stop("Failed to read registry");
        outro(chalk.red("Failed to read existing registry"));
        return;
      }
    }

    // Create registry entry using validation results
    const now = new Date().toISOString();
    const registryEntry: RegistryEntry = {
      name: validationResults.pluginInfo!.name,
      version: validationResults.pluginInfo!.version,
      description: validationResults.pluginInfo!.description || "",
      author: validationResults.pluginInfo!.author,
      repository: validationResults.pluginInfo!.repository,
      keywords: validationResults.pluginInfo!.keywords || [],
      peerDependencies: validationResults.pluginInfo!.peerDependencies,
      createdAt: now,
      updatedAt: now
    };

    // Check if plugin already exists
    const existingIndex = registry.plugins.findIndex(p => p.name === validationResults.pluginInfo!.name);
    
    if (existingIndex >= 0) {
      // Update existing entry
      const existingPlugin = registry.plugins[existingIndex];
      if (existingPlugin) {
        registryEntry.createdAt = existingPlugin.createdAt;
        registry.plugins[existingIndex] = registryEntry;
      }
    } else {
      // Add new entry
      registry.plugins.push(registryEntry);
    }

    // Sort plugins by name
    registry.plugins.sort((a, b) => a.name.localeCompare(b.name));

    try {
      writeFileSync(registryPath, JSON.stringify(registry, null, 2));
      s.stop("Registry updated successfully");
      
      outro(chalk.green(`✅ Plugin "${validationResults.pluginInfo!.name}" registered successfully!`));
      
      console.log(chalk.gray("\nRegistry location:"));
      console.log(chalk.gray(`  ${registryPath}`));
      
    } catch (error) {
      s.stop("Failed to update registry");
      outro(chalk.red(`Error updating registry: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }

  } catch (error) {
    s.stop("Validation failed");
    outro(chalk.red(`Error during validation: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

export const register = new Command("register")
  .description("Register a plugin with the every-plugin registry")
  .argument("<plugin-path>", "Path to the plugin directory")
  .option("--registry <path>", "Path to the registry directory")
  .action(registerPlugin);

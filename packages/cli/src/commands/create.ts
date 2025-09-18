import { Command } from "commander";
import { intro, outro, text, select, confirm, spinner } from "@clack/prompts";
import chalk from "chalk";
import degit from "degit";
import { resolve, join } from "path";
import { existsSync, writeFileSync } from "fs";
import { readFileSync } from "fs";

interface PluginTemplate {
  name: string;
  description: string;
  source: string;
}

const AVAILABLE_TEMPLATES: PluginTemplate[] = [
  {
    name: "masa-source",
    description: "MASA blockchain source plugin template",
    source: "near-everything/every-plugin/plugins/masa-source"
  },
  {
    name: "telegram-source", 
    description: "Telegram source plugin template",
    source: "near-everything/every-plugin/plugins/telegram-source"
  },
  {
    name: "basic",
    description: "Basic plugin template with minimal setup",
    source: "near-everything/every-plugin/plugins/masa-source" // Use masa-source as base for now
  }
];

async function createPlugin(pluginName: string, options: { template?: string; cwd?: string }) {
  const targetDir = resolve(options.cwd || process.cwd(), pluginName);
  
  intro(chalk.cyan("🔌 Creating every-plugin"));

  // Check if directory already exists
  if (existsSync(targetDir)) {
    const shouldOverwrite = await confirm({
      message: `Directory ${pluginName} already exists. Overwrite?`,
      initialValue: false
    });

    if (!shouldOverwrite) {
      outro(chalk.yellow("Operation cancelled"));
      return;
    }
  }

  // Select template
  let selectedTemplate: PluginTemplate;
  
  if (options.template) {
    const template = AVAILABLE_TEMPLATES.find(t => t.name === options.template);
    if (!template) {
      outro(chalk.red(`Template "${options.template}" not found. Available templates: ${AVAILABLE_TEMPLATES.map(t => t.name).join(", ")}`));
      return;
    }
    selectedTemplate = template;
  } else {
    const templateChoice = await select({
      message: "Select a template:",
      options: AVAILABLE_TEMPLATES.map(template => ({
        value: template.name,
        label: template.name,
        hint: template.description
      }))
    });

    if (typeof templateChoice !== 'string') {
      outro(chalk.yellow("Operation cancelled"));
      return;
    }

    selectedTemplate = AVAILABLE_TEMPLATES.find(t => t.name === templateChoice)!;
  }

  // Get plugin details
  const pluginDescription = await text({
    message: "Plugin description:",
    placeholder: "A plugin for every-plugin",
    defaultValue: `${pluginName} plugin for every-plugin`
  });

  if (typeof pluginDescription !== 'string') {
    outro(chalk.yellow("Operation cancelled"));
    return;
  }

  // Clone template
  const s = spinner();
  s.start("Cloning template...");

  try {
    const emitter = degit(selectedTemplate.source, {
      cache: false,
      force: true,
      verbose: false
    });

    await emitter.clone(targetDir);
    s.stop("Template cloned successfully");

    // Update package.json with new plugin details
    s.start("Updating package.json...");
    
    const packageJsonPath = join(targetDir, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      
      // Update package details
      packageJson.name = pluginName.startsWith("@") ? pluginName : `@${pluginName}/plugin`;
      packageJson.description = pluginDescription;
      packageJson.version = "0.0.1";
      
      // Ensure proper every-plugin peer dependency
      if (!packageJson.peerDependencies) {
        packageJson.peerDependencies = {};
      }
      packageJson.peerDependencies["every-plugin"] = "^0.1.0";
      
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }
    
    s.stop("Package.json updated");

    outro(chalk.green(`✅ Plugin "${pluginName}" created successfully!`));
    
    console.log(chalk.gray("\nNext steps:"));
    console.log(chalk.gray(`  cd ${pluginName}`));
    console.log(chalk.gray("  bun install"));
    console.log(chalk.gray("  bun run dev"));
    
  } catch (error) {
    s.stop("Failed to clone template");
    outro(chalk.red(`Error creating plugin: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

export const create = new Command("create")
  .description("Create a new every-plugin")
  .argument("<plugin-name>", "Name of the plugin to create")
  .option("-t, --template <template>", `Template to use (${AVAILABLE_TEMPLATES.map(t => t.name).join(", ")})`)
  .option("--cwd <cwd>", "The working directory", process.cwd())
  .action(createPlugin);

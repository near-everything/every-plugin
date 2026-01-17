import { execa } from "execa";
import { join } from "path";
import { loadConfig, getConfigDir, type BosConfig } from "../config";
import { colors, gradients, icons } from "../utils/theme";

type CreateType = "project" | "ui" | "api" | "host";

const DEFAULT_TEMPLATES: Record<CreateType, string> = {
  project: "near-everything/every-plugin/demo",
  ui: "near-everything/every-plugin/demo/ui",
  api: "near-everything/every-plugin/demo/api",
  host: "near-everything/every-plugin/demo/host",
};

function getTemplateUrl(type: CreateType, customTemplate?: string): string {
  if (customTemplate) return customTemplate;

  try {
    const config = loadConfig() as BosConfig & { create?: Record<string, string> };
    if (config.create?.[type]) {
      return config.create[type];
    }
  } catch {
    // No config, use defaults
  }

  return DEFAULT_TEMPLATES[type];
}

async function runDegit(template: string, dest: string): Promise<void> {
  console.log();
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log(`  ${icons.pkg} ${gradients.cyber("SCAFFOLD")}`);
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log();

  console.log(`  ${icons.scan} ${colors.dim("Template:")} ${colors.white(template)}`);
  console.log(`  ${icons.arrow} ${colors.dim("Target: ")} ${colors.white(dest)}`);
  console.log();

  try {
    await execa("npx", ["degit", template, dest], {
      stdio: "inherit",
    });

    console.log();
    console.log(`  ${colors.neonGreen(icons.ok)} ${colors.neonGreen("Scaffolded successfully")}`);
    console.log();
  } catch (error) {
    console.log();
    console.log(`  ${colors.magenta(icons.err)} ${colors.magenta("Scaffold failed")}`);
    throw error;
  }
}

async function generateBosConfig(name: string, dest: string): Promise<void> {
  const config = {
    account: `${name}.near`,
    create: {
      project: "near-everything/every-plugin/demo",
      ui: "near-everything/every-plugin/demo/ui",
      api: "near-everything/every-plugin/demo/api",
      host: "near-everything/every-plugin/demo/host",
    },
    app: {
      host: {
        title: name,
        description: `${name} BOS application`,
        development: "http://localhost:3001",
        production: `https://${name}.example.com`,
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
  await Bun.write(configPath, JSON.stringify(config, null, 2));
  console.log(`  ${icons.config} ${colors.dim("Created:")} ${colors.white("bos.config.json")}`);
}

async function updateExistingConfig(type: "ui" | "api" | "host"): Promise<void> {
  try {
    const configDir = getConfigDir();
    const configPath = join(configDir, "bos.config.json");
    const file = Bun.file(configPath);
    const content = await file.text();
    const config = JSON.parse(content);

    if (type === "host") {
      console.log(`  ${icons.host} ${colors.dim("Note:")} Host scaffolded, update bos.config.json manually`);
      return;
    }

    const port = type === "ui" ? 3002 : 3014;
    config.app[type] = {
      name: type,
      development: `http://localhost:${port}`,
      production: "",
      ...(type === "ui"
        ? {
            exposes: {
              App: "./App",
              components: "./components",
            },
          }
        : {
            variables: {},
            secrets: [],
          }),
    };

    await Bun.write(configPath, JSON.stringify(config, null, 2));
    console.log(`  ${icons.config} ${colors.dim("Updated:")} ${colors.white("bos.config.json")}`);
  } catch {
    console.log(`  ${icons.pending} ${colors.dim("Note:")} No bos.config.json found to update`);
  }
}

export async function createCommand(
  type: CreateType,
  name?: string,
  customTemplate?: string
): Promise<void> {
  const template = getTemplateUrl(type, customTemplate);
  const dest = type === "project" ? name! : type;

  const file = Bun.file(dest);
  if (await file.exists()) {
    console.log();
    console.log(`  ${colors.magenta(icons.err)} ${colors.magenta(`Directory "${dest}" already exists`)}`);
    console.log();
    process.exit(1);
  }

  await runDegit(template, dest);

  if (type === "project" && name) {
    await generateBosConfig(name, dest);
  } else if (type !== "project") {
    await updateExistingConfig(type);
  }

  console.log();
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log(`  ${icons.run} ${gradients.neon("Next steps:")}`);
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log();

  if (type === "project") {
    console.log(`  ${colors.dim("1.")} cd ${dest}`);
    console.log(`  ${colors.dim("2.")} bun install`);
    console.log(`  ${colors.dim("3.")} bun bos dev`);
  } else {
    console.log(`  ${colors.dim("1.")} cd ${dest}`);
    console.log(`  ${colors.dim("2.")} bun install`);
    console.log(`  ${colors.dim("3.")} Update bos.config.json with remote details`);
  }

  console.log();
}

import { RssDistributorConfigSchema, RssDistributorInputSchema, RssDistributorOutputSchema } from './../../plugins/rss/src/plugins/distributor';
import fs from 'fs/promises';
import path from 'path';
import { z } from "zod";

import { MasaSourceConfigSchema, MasaSourceInputSchema, MasaSourceOutputSchema } from "../../plugins/masa-source/src/schemas/index.js";
import { ObjectTransformerConfigSchema, ObjectTransformerInputSchema, ObjectTransformerOutputSchema } from "../../plugins/object-transform/src/schemas/index.js";
import { SimpleTransformerConfigSchema, SimpleTransformerInputSchema, SimpleTransformerOutputSchema } from "../../plugins/simple-transform/src/schemas/index.js";
import { AITransformerConfigSchema, AITransformerInputSchema, AITransformerOutputSchema } from './../../plugins/ai-transform/src/schemas/index';
import { NotionDistributorConfigSchema, NotionDistributorInputSchema, NotionDistributorOutputSchema } from './../../plugins/notion/src/schemas/index.js';
import { TelegramSourceConfigSchema, TelegramSourceInputSchema, TelegramSourceOutputSchema } from './../../plugins/telegram-source/src/schemas/index.js';
import { X23SourceConfigSchema, X23SourceInputSchema, X23SourceOutputSchema } from './../../plugins/x23-source/src/schemas/index.js';

// Plugin schema definitions
const pluginSchemas = {
  'simple-transform': {
    configSchema: SimpleTransformerConfigSchema,
    inputSchema: SimpleTransformerInputSchema,
    outputSchema: SimpleTransformerOutputSchema
  },
  'object-transform': {
    configSchema: ObjectTransformerConfigSchema,
    inputSchema: ObjectTransformerInputSchema,
    outputSchema: ObjectTransformerOutputSchema
  },
  'ai-transform': {
    configSchema: AITransformerConfigSchema,
    inputSchema: AITransformerInputSchema,
    outputSchema: AITransformerOutputSchema
  },
  'masa-source': {
    configSchema: MasaSourceConfigSchema,
    inputSchema: MasaSourceInputSchema,
    outputSchema: MasaSourceOutputSchema
  },
  'telegram-source': {
    configSchema: TelegramSourceConfigSchema,
    inputSchema: TelegramSourceInputSchema,
    outputSchema: TelegramSourceOutputSchema
  },
  'x23-source': {
    configSchema: X23SourceConfigSchema,
    inputSchema: X23SourceInputSchema,
    outputSchema: X23SourceOutputSchema
  },
  'notion': {
    configSchema: NotionDistributorConfigSchema,
    inputSchema: NotionDistributorInputSchema,
    outputSchema: NotionDistributorOutputSchema
  },
  'rss': {
    configSchema: RssDistributorConfigSchema,
    inputSchema: RssDistributorInputSchema,
    outputSchema: RssDistributorOutputSchema
  }
} as const;

// This list will be the single source of truth for which plugins are active.
const pluginsToRegister = {
  'simple-transform': "SimpleTransformer",
  'object-transform': "ObjectTransformer",
  'ai-transform': "AITransformer",
  'masa-source': "MasaSource",
  'telegram-source': "TelegramSource",
  'x23-source': "X23Source",
  'notion': "NotionDistributor",
  'rss': "RssDistributor"
} as const;

const registry: Record<string, any> = {};

console.log('Starting registry generation...');

for (const [pluginId, schemaPrefix] of Object.entries(pluginsToRegister)) {
  console.log(`Processing plugin: ${pluginId}`);
  // Assumes the script is run from the root of the monorepo
  const pluginPath = path.resolve(process.cwd(), `plugins/${pluginId}`);
  const packageJsonPath = path.join(pluginPath, 'package.json');
  const rspackConfigPath = path.join(pluginPath, 'rspack.config.cjs');

  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    const rspackConfig = await import(rspackConfigPath);
    const port = rspackConfig.default.devServer.port;

    const schemas = pluginSchemas[pluginId as keyof typeof pluginSchemas];
    if (!schemas) {
      throw new Error(`Schema definition not found for plugin: ${pluginId}`);
    }

    const { configSchema, inputSchema, outputSchema } = schemas;

    registry[packageJson.name] = {
      remoteUrl: `http://localhost:${port}/remoteEntry.js`,
      configSchema: z.toJSONSchema(configSchema),
      inputSchema: z.toJSONSchema(inputSchema),
      outputSchema: z.toJSONSchema(outputSchema),
      version: packageJson.version,
      description: packageJson.description
    };
    console.log(`Successfully processed plugin: ${pluginId}`);

  } catch (error) {
    console.error(`Failed to process plugin: ${pluginId}`, error);
  }
}

const registryPath = path.resolve(process.cwd(), 'packages/registry-builder/registry.json');
await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));

console.log(`\nRegistry generated successfully at: ${registryPath}`);

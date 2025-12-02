#!/usr/bin/env bun
/**
 * Script to publish plugin updates to the FastFS Registry
 * 
 * Usage:
 *   bun scripts/publish-to-registry.ts --name @data-provider/aggregator --url https://... --version 1.0.0
 * 
 * Environment Variables:
 *   REGISTRY_ACCOUNT_ID - The NEAR account that owns the registry (e.g., intents-registry.near)
 *   NEAR_PRIVATE_KEY - Private key for signing transactions
 *   RELAYER_URL - URL of the registry plugin (e.g., https://.../remoteEntry.js or base URL)
 */

import { createPluginRuntime } from "every-plugin";
import { Near } from "near-kit";
import {
  createUpdateDelegateAction,
  type RegistryConfig,
  type RegistryItem
} from "../plugins/registry/src/index";

interface Args {
  name: string;
  url: string;
  version: string;
  commit?: string;
  buildId?: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const parsed: Partial<Args> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '');
    const value = args[i + 1];
    if (key && value) {
      parsed[key as keyof Args] = value;
    }
  }

  if (!parsed.name || !parsed.url || !parsed.version) {
    console.error('Missing required arguments: --name, --url, --version');
    process.exit(1);
  }

  return parsed as Args;
}

async function main() {
  const args = parseArgs();

  const publisher = "efiz.near";
  const privateKey = process.env.NEAR_PRIVATE_KEY;
  const relayerUrl = "https://elliot-braem-648-data-provider-registry-data-prov-dccb058e9-ze.zephyrcloud.app";

  if (!publisher) {
    console.error('REGISTRY_ACCOUNT_ID environment variable is required');
    process.exit(1);
  }

  if (!privateKey) {
    console.error('NEAR_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  if (!relayerUrl) {
    console.error('RELAYER_URL environment variable is required');
    process.exit(1);
  }

  const network = 'mainnet';
  const near = new Near({
    network,
    privateKey: privateKey as `ed25519:${string}`,
    defaultSignerId: publisher,
  });

  const registryConfig: RegistryConfig = {
    accountId: publisher,
    contractId: "fastfs.near",
    relativePath: 'registry.json',
  };

  const pluginUpdate: RegistryItem = {
    name: args.name,
    type: 'registry:plugin',
    url: args.url,
    version: args.version,
    ...(args.commit && { commit: args.commit }),
    ...(args.buildId && { buildId: args.buildId }),
  };

  console.log('📦 Publishing plugin update:');
  console.log(`   Name: ${pluginUpdate.name}`);
  console.log(`   URL: ${pluginUpdate.url}`);
  console.log(`   Version: ${pluginUpdate.version}`);

  try {
    console.log('🔐 Creating delegate action...');
    const { payload } = await createUpdateDelegateAction(near, registryConfig, pluginUpdate);

    const remoteUrl = relayerUrl.endsWith('.js')
      ? relayerUrl
      : `${relayerUrl}/remoteEntry.js`;

    console.log('📡 Connecting to registry plugin:', remoteUrl);
    const runtime = createPluginRuntime({
      registry: {
        "@data-provider/registry": { remoteUrl }
      },
      secrets: {

      }
    });

    const { client } = await runtime.usePlugin("@data-provider/registry", {
      variables: {
        network: "mainnet"
      },
      secrets: {
        relayerAccountId: "relayer.efiz.near",
        relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY
      }
    });

    console.log('📤 Submitting to relayer...');
    const result = await client.publish({ payload });

    const explorerUrl = `https://nearblocks.io/txns/${result.hash}`
    const fastfsUrl = `https://${registryConfig.accountId}.fastfs.io/${registryConfig.contractId}/${registryConfig.relativePath}`;

    console.log('✅ Published via relayer!');
    console.log('   Transaction URL:', explorerUrl);
    console.log('   Registry Data URL:', fastfsUrl);

    await runtime.shutdown();
  } catch (error) {
    console.error('❌ Failed to publish:', error);
    process.exit(1);
  }
}

main();

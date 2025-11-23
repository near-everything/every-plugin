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
 *   USE_DELEGATE - Set to 'true' to create a delegate action instead of direct publish
 *   RELAYER_URL - URL of the relayer API (required if USE_DELEGATE=true)
 */

import { Near } from "near-kit";
import {
  createUpdateDelegateAction,
  publishPluginUpdate,
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

  // Validate env vars
  const registryAccountId = process.env.REGISTRY_ACCOUNT_ID;
  const privateKey = process.env.NEAR_PRIVATE_KEY;
  const useDelegate = process.env.USE_DELEGATE === 'true';
  const relayerUrl = process.env.RELAYER_URL;

  if (!registryAccountId) {
    console.error('REGISTRY_ACCOUNT_ID environment variable is required');
    process.exit(1);
  }

  if (!privateKey) {
    console.error('NEAR_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  if (useDelegate && !relayerUrl) {
    console.error('RELAYER_URL is required when USE_DELEGATE=true');
    process.exit(1);
  }

  // Initialize Near
  const network = 'testnet';
  const near = new Near({
    network,
    privateKey: privateKey as `ed25519:${string}`,
    defaultSignerId: registryAccountId,
  });

  const registryConfig: RegistryConfig = {
    accountId: registryAccountId,
    contractId: 'fastfs.near',
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
    if (useDelegate) {
      // Create delegate action and send to relayer
      console.log('🔐 Creating delegate action...');
      const { payload } = await createUpdateDelegateAction(near, registryConfig, pluginUpdate);

      console.log('📤 Sending to relayer:', relayerUrl);
      const response = await fetch(relayerUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      });

      if (!response.ok) {
        throw new Error(`Relayer request failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Published via relayer!');
      console.log('   Transaction Hash:', result.hash);
    } else {
      // Direct publish
      console.log('📡 Publishing directly to NEAR...');
      const result = await publishPluginUpdate(near, registryConfig, pluginUpdate);

      console.log('✅ Published successfully!');
      console.log('   Transaction Hash:', result.transaction.hash);
      console.log('   Block Height:', result.transaction_outcome.block_hash);
    }
  } catch (error) {
    console.error('❌ Failed to publish:', error);
    process.exit(1);
  }
}

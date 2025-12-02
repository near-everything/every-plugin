import { Near } from "near-kit";
import { serialize as borshSerialize } from "borsh";
import type { Registry, RegistryItem, FastfsUploadData } from "./schema";
import { RegistrySchema } from "./schema";

export interface RegistryConfig {
  accountId: string;
  contractId?: string;
  relativePath?: string;
}

export async function fetchRegistry(config: RegistryConfig): Promise<Registry> {
  const { accountId, contractId = "fastfs.near", relativePath = "registry.json" } = config;
  const url = `https://${accountId}.fastfs.io/${contractId}/${relativePath}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch registry: ${response.statusText}`);
  }

  const data = await response.json();
  return RegistrySchema.parse(data);
}

export function updatePluginInRegistry(
  registry: Registry,
  pluginUpdate: RegistryItem
): Registry {
  const existingIndex = registry.items.findIndex(item => item.name === pluginUpdate.name);

  const updatedItems = existingIndex >= 0
    ? registry.items.map((item, idx) => idx === existingIndex ? pluginUpdate : item)
    : [...registry.items, pluginUpdate];

  return {
    ...registry,
    items: updatedItems,
    updatedAt: new Date().toISOString(),
  };
}

export function serializeRegistryForFastFS(
  registry: Registry,
  relativePath: string = "registry.json"
): Uint8Array {
  const jsonContent = JSON.stringify(registry, null, 2);
  const contentBytes = new TextEncoder().encode(jsonContent);

  const fastfsData: FastfsUploadData = {
    simple: {
      relativePath,
      content: {
        mimeType: "application/json",
        content: contentBytes,
      },
    },
  };

  const fastfsSchema = {
    enum: [
      {
        struct: {
          simple: {
            struct: {
              relativePath: "string",
              content: {
                option: {
                  struct: {
                    mimeType: "string",
                    content: { array: { type: "u8" } }
                  }
                }
              }
            }
          }
        }
      }
    ]
  };

  const serialized = borshSerialize(fastfsSchema, fastfsData);
  return new Uint8Array(serialized);
}

export async function createUpdateTx(
  near: Near,
  config: RegistryConfig,
  pluginUpdate: RegistryItem
) {
  const { accountId, contractId = "fastfs.near", relativePath = "registry.json" } = config;

  let currentRegistry: Registry;
  try {
    currentRegistry = await fetchRegistry(config);
  } catch (error) {
    console.log('Registry not found, initializing new registry...');
    currentRegistry = {
      items: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const updatedRegistry = updatePluginInRegistry(currentRegistry, pluginUpdate);
  const serializedData = serializeRegistryForFastFS(updatedRegistry, relativePath);

  return near
    .transaction(accountId)
    .functionCall(
      contractId,
      "__fastdata_fastfs",
      serializedData,
      {
        gas: "300 Tgas",
        attachedDeposit: "0 NEAR",
      }
    );
}

export async function createUpdateDelegateAction(
  near: Near,
  config: RegistryConfig,
  pluginUpdate: RegistryItem
) {
  const tx = await createUpdateTx(near, config, pluginUpdate);
  return tx.delegate();
}

export async function publishPluginUpdate(
  near: Near,
  config: RegistryConfig,
  pluginUpdate: RegistryItem
) {
  const tx = await createUpdateTx(near, config, pluginUpdate);
  return tx.send();
}

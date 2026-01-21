import { Graph } from "near-social-js";
import { buildConfigPath, buildSecretsPath } from "./utils";

export interface BosConfig {
  account: string;
  gateway?: string;
  app: {
    host: {
      title: string;
      description?: string;
      development: string;
      production: string;
      secrets?: string[];
    };
    ui: {
      name: string;
      development: string;
      production: string;
      ssr?: string;
      exposes: Record<string, string>;
    };
    api: {
      name: string;
      development: string;
      production: string;
      variables?: Record<string, unknown>;
      secrets?: string[];
    };
  };
}

export interface SecretsReference {
  cid: string;
  groupId: string;
  updatedAt: string;
}

const graph = new Graph();

export async function fetchTenantConfig(
  nearAccount: string,
  gatewayDomain: string
): Promise<BosConfig | null> {
  const configPath = buildConfigPath(nearAccount, gatewayDomain);

  try {
    const data = await graph.get({ keys: [configPath] });
    if (!data) {
      console.error(`No data returned for ${nearAccount}`);
      return null;
    }
    const configJson = getNestedValue(data, configPath);

    if (!configJson) {
      console.error(`No config found for ${nearAccount} at ${configPath}`);
      return null;
    }

    return JSON.parse(configJson) as BosConfig;
  } catch (error) {
    console.error(`Error fetching config for ${nearAccount}:`, error);
    return null;
  }
}

export async function fetchSecretsReference(
  nearAccount: string,
  gatewayDomain: string
): Promise<SecretsReference | null> {
  const secretsPath = buildSecretsPath(nearAccount, gatewayDomain);

  try {
    const data = await graph.get({ keys: [secretsPath] });
    if (!data) {
      return null;
    }
    const secretsJson = getNestedValue(data, secretsPath);

    if (!secretsJson) {
      return null;
    }

    return JSON.parse(secretsJson) as SecretsReference;
  } catch {
    return null;
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): string | null {
  const parts = path.split("/");
  let current: unknown = obj;

  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }

  return typeof current === "string" ? current : null;
}

export function getAllRequiredSecrets(config: BosConfig): string[] {
  const secrets: string[] = [];

  if (config.app.host.secrets) {
    secrets.push(...config.app.host.secrets);
  }

  if (config.app.api.secrets) {
    secrets.push(...config.app.api.secrets);
  }

  return [...new Set(secrets)];
}

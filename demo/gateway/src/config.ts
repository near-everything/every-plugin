import { buildConfigUrl, buildSecretsUrl } from "./utils";

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

export async function fetchTenantConfig(
  nearAccount: string,
  gatewayDomain: string
): Promise<BosConfig | null> {
  const configUrl = buildConfigUrl(nearAccount, gatewayDomain);

  try {
    const response = await fetch(configUrl, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      console.error(`Failed to fetch config for ${nearAccount}: ${response.status}`);
      return null;
    }

    return (await response.json()) as BosConfig;
  } catch (error) {
    console.error(`Error fetching config for ${nearAccount}:`, error);
    return null;
  }
}

export async function fetchSecretsReference(
  nearAccount: string,
  gatewayDomain: string
): Promise<SecretsReference | null> {
  const secretsUrl = buildSecretsUrl(nearAccount, gatewayDomain);

  try {
    const response = await fetch(secretsUrl, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as SecretsReference;
  } catch {
    return null;
  }
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

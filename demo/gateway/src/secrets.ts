import type { SecretsReference } from "./config";

export interface SecretsResult {
  secrets: Record<string, string>;
  error?: string;
}

export async function fetchSecretsFromNova(
  secretsRef: SecretsReference,
  novaSessionToken: string
): Promise<SecretsResult> {
  const MCP_URL = "https://nova-mcp.fastmcp.app";

  try {
    const retrieveResponse = await fetch(`${MCP_URL}/retrieve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${novaSessionToken}`,
      },
      body: JSON.stringify({
        group_id: secretsRef.groupId,
        cid: secretsRef.cid,
      }),
    });

    if (!retrieveResponse.ok) {
      const errorText = await retrieveResponse.text();
      return {
        secrets: {},
        error: `NOVA retrieve failed: ${retrieveResponse.status} - ${errorText}`,
      };
    }

    const result = (await retrieveResponse.json()) as { data: string };
    const decryptedData = Buffer.from(result.data, "base64").toString("utf-8");
    const secrets = JSON.parse(decryptedData) as Record<string, string>;

    return { secrets };
  } catch (error) {
    return {
      secrets: {},
      error: `NOVA error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function filterSecrets(
  allSecrets: Record<string, string>,
  requiredKeys: string[]
): Record<string, string> {
  const filtered: Record<string, string> = {};

  for (const key of requiredKeys) {
    if (key in allSecrets) {
      filtered[key] = allSecrets[key];
    }
  }

  return filtered;
}

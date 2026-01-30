import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Effect } from "every-plugin/effect";
import { getConfigDir } from "../config";

export interface BosEnv {
  ZE_SERVER_TOKEN?: string;
  ZE_USER_EMAIL?: string;
  NEAR_PRIVATE_KEY?: string;
  GATEWAY_PRIVATE_KEY?: string;
  NOVA_SECRETS_CID?: string;
}

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

export const loadBosEnv = Effect.gen(function* () {
  const configDir = getConfigDir();
  const envBosPath = path.join(configDir, ".env.bos");
  const envPath = path.join(configDir, ".env");

  let envVars: BosEnv = {};

  const envFilePath = existsSync(envBosPath) ? envBosPath : existsSync(envPath) ? envPath : null;

  if (envFilePath) {
    const content = yield* Effect.tryPromise({
      try: () => readFile(envFilePath, "utf-8"),
      catch: () => new Error(`Failed to read ${envFilePath}`),
    });

    const parsed = parseEnvFile(content);
    envVars = {
      ZE_SERVER_TOKEN: parsed.ZE_SERVER_TOKEN,
      ZE_USER_EMAIL: parsed.ZE_USER_EMAIL,
      NEAR_PRIVATE_KEY: parsed.NEAR_PRIVATE_KEY,
      GATEWAY_PRIVATE_KEY: parsed.GATEWAY_PRIVATE_KEY,
      NOVA_SECRETS_CID: parsed.NOVA_SECRETS_CID,
    };
  }

  envVars.ZE_SERVER_TOKEN = envVars.ZE_SERVER_TOKEN || process.env.ZE_SERVER_TOKEN;
  envVars.ZE_USER_EMAIL = envVars.ZE_USER_EMAIL || process.env.ZE_USER_EMAIL;
  envVars.NEAR_PRIVATE_KEY = envVars.NEAR_PRIVATE_KEY || process.env.NEAR_PRIVATE_KEY;
  envVars.GATEWAY_PRIVATE_KEY = envVars.GATEWAY_PRIVATE_KEY || process.env.GATEWAY_PRIVATE_KEY;
  envVars.NOVA_SECRETS_CID = envVars.NOVA_SECRETS_CID || process.env.NOVA_SECRETS_CID;

  return envVars;
});

export const ZEPHYR_DOCS_URL = "https://docs.zephyr-cloud.io/features/ci-cd-server-token";

export const getBuildEnv = (bosEnv: BosEnv): Record<string, string> => {
  const env: Record<string, string> = { ...process.env as Record<string, string> };

  if (bosEnv.ZE_SERVER_TOKEN) {
    env.ZE_SERVER_TOKEN = bosEnv.ZE_SERVER_TOKEN;
  }
  if (bosEnv.ZE_USER_EMAIL) {
    env.ZE_USER_EMAIL = bosEnv.ZE_USER_EMAIL;
  }

  return env;
};

export const hasZephyrConfig = (bosEnv: BosEnv): boolean => {
  return !!(bosEnv.ZE_SERVER_TOKEN && bosEnv.ZE_USER_EMAIL);
};

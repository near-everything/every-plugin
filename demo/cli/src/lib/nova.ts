import { NovaSdk } from "nova-sdk-js";
import { Effect } from "every-plugin/effect";
import { getConfigDir } from "../config";

export interface NovaConfig {
  accountId: string;
  sessionToken: string;
}

export interface SecretsData {
  secrets: Record<string, string>;
  updatedAt: string;
}

export interface UploadResult {
  cid: string;
  groupId: string;
  txHash?: string;
}

export const getNovaConfig = Effect.gen(function* () {
  const accountId = process.env.NOVA_ACCOUNT_ID;
  const sessionToken = process.env.NOVA_API_KEY;

  if (!accountId || !sessionToken) {
    return yield* Effect.fail(
      new Error(
        "NOVA credentials not configured. Run 'bos login' to authenticate with NOVA."
      )
    );
  }

  return { accountId, sessionToken } satisfies NovaConfig;
});

export function createNovaClient(config: NovaConfig): NovaSdk {
  return new NovaSdk(config.accountId, {
    apiKey: config.sessionToken,
  });
}

export function getSecretsGroupId(nearAccount: string): string {
  return `${nearAccount}-secrets`;
}

export const registerSecretsGroup = (
  nova: NovaSdk,
  nearAccount: string,
  novaAccount: string
) =>
  Effect.gen(function* () {
    const groupId = getSecretsGroupId(nearAccount);

    yield* Effect.tryPromise({
      try: () => nova.registerGroup(groupId),
      catch: (e) => new Error(`Failed to register NOVA group: ${e}`),
    });

    yield* Effect.tryPromise({
      try: () => nova.addGroupMember(groupId, novaAccount),
      catch: (e) => new Error(`Failed to add gateway Nova account to group: ${e}`),
    });

    return groupId;
  });

export const uploadSecrets = (
  nova: NovaSdk,
  groupId: string,
  secrets: Record<string, string>
) =>
  Effect.gen(function* () {
    const secretsData: SecretsData = {
      secrets,
      updatedAt: new Date().toISOString(),
    };

    const buffer = Buffer.from(JSON.stringify(secretsData, null, 2));

    const result = yield* Effect.tryPromise({
      try: () => nova.upload(groupId, buffer, "secrets.json"),
      catch: (e) => new Error(`Failed to upload secrets to NOVA: ${e}`),
    });

    return {
      cid: result.cid,
      groupId,
      txHash: result.trans_id,
    } satisfies UploadResult;
  });

export const retrieveSecrets = (nova: NovaSdk, groupId: string, cid: string) =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: () => nova.retrieve(groupId, cid),
      catch: (e) => new Error(`Failed to retrieve secrets from NOVA: ${e}`),
    });

    const secretsData = JSON.parse(result.data.toString()) as SecretsData;
    return secretsData;
  });

export function parseEnvFile(content: string): Record<string, string> {
  const secrets: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      secrets[key] = value;
    }
  }

  return secrets;
}

export function filterSecretsToRequired(
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

export function hasNovaCredentials(): boolean {
  return !!(process.env.NOVA_ACCOUNT_ID && process.env.NOVA_API_KEY);
}

function getBosEnvPath(): string {
  return `${getConfigDir()}/.env.bos`;
}

export const saveNovaCredentials = (accountId: string, sessionToken: string) =>
  Effect.gen(function* () {
    const envPath = getBosEnvPath();
    let content = "";

    const file = Bun.file(envPath);
    const exists = yield* Effect.promise(() => file.exists());

    if (exists) {
      content = yield* Effect.tryPromise({
        try: () => file.text(),
        catch: () => new Error("File read failed"),
      }).pipe(Effect.orElseSucceed(() => ""));
    }

    const lines = content.split("\n");
    const newLines: string[] = [];
    let foundAccountId = false;
    let foundSessionToken = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("NOVA_ACCOUNT_ID=")) {
        newLines.push(`NOVA_ACCOUNT_ID=${accountId}`);
        foundAccountId = true;
      } else if (trimmed.startsWith("NOVA_API_KEY=")) {
        newLines.push(`NOVA_API_KEY=${sessionToken}`);
        foundSessionToken = true;
      } else {
        newLines.push(line);
      }
    }

    if (!foundAccountId) {
      if (newLines.length > 0 && newLines[newLines.length - 1] !== "") {
        newLines.push("");
      }
      newLines.push(`NOVA_ACCOUNT_ID=${accountId}`);
    }

    if (!foundSessionToken) {
      newLines.push(`NOVA_API_KEY=${sessionToken}`);
    }

    yield* Effect.tryPromise({
      try: () => Bun.write(envPath, newLines.join("\n")),
      catch: (e) => new Error(`Failed to save credentials: ${e}`),
    });

    process.env.NOVA_ACCOUNT_ID = accountId;
    process.env.NOVA_API_KEY = sessionToken;
  });

export const removeNovaCredentials = Effect.gen(function* () {
  const envPath = getBosEnvPath();
  let content = "";

  try {
    content = yield* Effect.tryPromise({
      try: () => Bun.file(envPath).text(),
      catch: () => "",
    });
  } catch {
    return;
  }

  const lines = content.split("\n");
  const newLines = lines.filter((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith("NOVA_ACCOUNT_ID=") && !trimmed.startsWith("NOVA_API_KEY=");
  });

  yield* Effect.tryPromise({
    try: () => Bun.write(envPath, newLines.join("\n")),
    catch: (e) => new Error(`Failed to remove credentials: ${e}`),
  });

  delete process.env.NOVA_ACCOUNT_ID;
  delete process.env.NOVA_API_KEY;
});

export const verifyNovaCredentials = (accountId: string, sessionToken: string) =>
  Effect.gen(function* () {
    const nova = new NovaSdk(accountId, { apiKey: sessionToken });

    yield* Effect.tryPromise({
      try: () => nova.getBalance(),
      catch: (e) => {
        const message = e instanceof Error ? e.message : String(e);
        return new Error(`NOVA verification failed: ${message}`);
      },
    });

    return true;
  });

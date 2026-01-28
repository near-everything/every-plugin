import { Context, Effect, Layer } from "effect";
import type { BosConfig } from "everything-dev";
import { Graph } from "near-social-js";
import { ConfigNotFoundError, ConfigParseError } from "../errors";
import { buildConfigPath, buildSecretsPath } from "../utils";

export type { BosConfig };

export interface SecretsReference {
  cid: string;
  groupId: string;
  updatedAt: string;
}

export interface ConfigService {
  fetchConfig: (
    nearAccount: string,
    gatewayDomain: string
  ) => Effect.Effect<BosConfig, ConfigNotFoundError | ConfigParseError>;
  fetchSecretsRef: (
    nearAccount: string,
    gatewayDomain: string
  ) => Effect.Effect<SecretsReference | null>;
  getAllRequiredSecrets: (config: BosConfig) => string[];
}

export class ConfigServiceTag extends Context.Tag("ConfigService")<
  ConfigServiceTag,
  ConfigService
>() {}

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

export const ConfigServiceLive = Layer.succeed(
  ConfigServiceTag,
  ConfigServiceTag.of({
    fetchConfig: (nearAccount: string, gatewayDomain: string) =>
      Effect.gen(function* () {
        const graph = new Graph();
        const configPath = buildConfigPath(nearAccount, gatewayDomain);

        const data = yield* Effect.tryPromise({
          try: () => graph.get({ keys: [configPath] }),
          catch: (error) =>
            new ConfigNotFoundError({
              account: nearAccount,
              path: configPath,
            }),
        });

        if (!data) {
          return yield* Effect.fail(
            new ConfigNotFoundError({
              account: nearAccount,
              path: configPath,
            })
          );
        }

        const configJson = getNestedValue(data, configPath);

        if (!configJson) {
          return yield* Effect.fail(
            new ConfigNotFoundError({
              account: nearAccount,
              path: configPath,
            })
          );
        }

        const config = yield* Effect.try({
          try: () => JSON.parse(configJson) as BosConfig,
          catch: (error) =>
            new ConfigParseError({
              account: nearAccount,
              cause: error,
            }),
        });

        return config;
      }),

    fetchSecretsRef: (nearAccount: string, gatewayDomain: string) =>
      Effect.gen(function* () {
        const graph = new Graph();
        const secretsPath = buildSecretsPath(nearAccount, gatewayDomain);

        const data = yield* Effect.tryPromise({
          try: () => graph.get({ keys: [secretsPath] }),
          catch: () => null,
        });

        if (!data) {
          return null;
        }

        const secretsJson = getNestedValue(data, secretsPath);

        if (!secretsJson) {
          return null;
        }

        const ref = yield* Effect.try({
          try: () => JSON.parse(secretsJson) as SecretsReference,
          catch: () => null as SecretsReference | null,
        });

        return ref;
      }).pipe(Effect.catchAll(() => Effect.succeed(null))),

    getAllRequiredSecrets: (config: BosConfig) => {
      const secrets: string[] = [];

      if (config.app.host.secrets) {
        secrets.push(...config.app.host.secrets);
      }

      const apiConfig = config.app.api;
      if (apiConfig && "secrets" in apiConfig && apiConfig.secrets) {
        secrets.push(...apiConfig.secrets);
      }

      return [...new Set(secrets)];
    },
  })
);

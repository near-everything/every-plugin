import { Context, Effect, Layer } from "effect";
import { NovaError } from "../errors";
import type { SecretsReference } from "./config";

const MCP_URL = "https://nova-mcp.fastmcp.app";

export interface SecretsService {
  fetchSecrets: (
    ref: SecretsReference,
    novaSessionToken: string
  ) => Effect.Effect<Record<string, string>, NovaError>;
  filterSecrets: (
    allSecrets: Record<string, string>,
    requiredKeys: string[]
  ) => Record<string, string>;
}

export class SecretsServiceTag extends Context.Tag("SecretsService")<
  SecretsServiceTag,
  SecretsService
>() {}

export const SecretsServiceLive = Layer.succeed(
  SecretsServiceTag,
  SecretsServiceTag.of({
    fetchSecrets: (ref: SecretsReference, novaSessionToken: string) =>
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(`${MCP_URL}/retrieve`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${novaSessionToken}`,
              },
              body: JSON.stringify({
                group_id: ref.groupId,
                cid: ref.cid,
              }),
            }),
          catch: (error) =>
            new NovaError({
              message: `NOVA fetch failed: ${error instanceof Error ? error.message : String(error)}`,
            }),
        });

        if (!response.ok) {
          const errorText = yield* Effect.tryPromise({
            try: () => response.text(),
            catch: () => "Unknown error",
          }).pipe(Effect.catchAll(() => Effect.succeed("Unknown error")));

          return yield* Effect.fail(
            new NovaError({
              message: `NOVA retrieve failed: ${response.status} - ${errorText}`,
              status: response.status,
            })
          );
        }

        const result = yield* Effect.tryPromise({
          try: () => response.json() as Promise<{ data: string }>,
          catch: (error) =>
            new NovaError({
              message: `NOVA response parse failed: ${error instanceof Error ? error.message : String(error)}`,
            }),
        });

        const decryptedData = yield* Effect.try({
          try: () => {
            const decoded = Buffer.from(result.data, "base64").toString("utf-8");
            return JSON.parse(decoded) as Record<string, string>;
          },
          catch: (error) =>
            new NovaError({
              message: `NOVA decrypt failed: ${error instanceof Error ? error.message : String(error)}`,
            }),
        });

        return decryptedData;
      }),

    filterSecrets: (
      allSecrets: Record<string, string>,
      requiredKeys: string[]
    ) => {
      const filtered: Record<string, string> = {};

      for (const key of requiredKeys) {
        if (key in allSecrets) {
          filtered[key] = allSecrets[key];
        }
      }

      return filtered;
    },
  })
);

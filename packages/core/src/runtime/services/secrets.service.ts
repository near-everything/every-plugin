import { Context, Effect } from "effect";
import { z } from "zod";
import type { SecretsConfig } from "../../types";
import { PluginRuntimeError } from "../errors";

const configSchema = z.object({
	secrets: z.record(z.string(), z.unknown())
}).loose();

export class SecretsConfigTag extends Context.Tag("SecretsConfig")<
	SecretsConfigTag,
	SecretsConfig
>() { }

export class SecretsService extends Effect.Service<SecretsService>()("SecretsService", {
	effect: Effect.gen(function* () {
		const secrets = yield* SecretsConfigTag;

		return {
			hydrateSecrets: <T>(config: T) =>
				Effect.gen(function* () {
					const parseResult = configSchema.parse(config);
					try {
						const configString = JSON.stringify(parseResult);
						let hydratedString = configString;

						for (const [key, value] of Object.entries(secrets)) {
							const pattern = new RegExp(`{{${key}}}`, "g");
							hydratedString = hydratedString.replace(pattern, String(value));
						}

						return JSON.parse(hydratedString) as T;
					} catch (error) {
						return yield* Effect.fail(
							new PluginRuntimeError({
								operation: "hydrate-secrets",
								cause:
									error instanceof Error ? error : new Error(String(error)),
								retryable: false,
							}),
						);
					}
				}),
		};
	}),
}) { }

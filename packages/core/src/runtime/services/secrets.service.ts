import { Effect, Layer } from "effect";
import { z } from "zod";
import type { SecretsConfig } from "../../types";
import { PluginRuntimeError } from "../errors";

export interface ISecretsService {
	readonly hydrateSecrets: <T>(
		config: T,
		secretsConfig: SecretsConfig,
	) => Effect.Effect<T, PluginRuntimeError>;
}

const configSchema = z.object({
	secrets: z.record(z.string(), z.unknown())
}).loose();

export class SecretsService extends Effect.Tag("SecretsService")<
	SecretsService,
	ISecretsService
>() {
	static Live = (secrets: SecretsConfig) =>
		Layer.succeed(SecretsService, {
			hydrateSecrets: <T>(config: T, secretsConfig: SecretsConfig) =>
				Effect.gen(function* () {
					const parseResult = configSchema.parse(config);
					try {
						const configString = JSON.stringify(parseResult);
						let hydratedString = configString;

						// Use provided secrets or fallback to secretsConfig
						const effectiveSecrets = { ...secretsConfig, ...secrets };

						// Simple template replacement for {{SECRET_NAME}} patterns
						for (const [key, value] of Object.entries(effectiveSecrets)) {
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
		});
}

export const SecretsServiceTag = SecretsService;
export const SecretsServiceLive = SecretsService.Live;

import { Effect, Layer } from "effect";
import { PluginRuntimeError } from "../errors";
import type { SecretsConfig } from "../types";

export interface ISecretsService {
	readonly hydrateSecrets: (
		config: any, // TODO:
		secretsConfig: SecretsConfig,
	) => Effect.Effect<any, PluginRuntimeError>;
}

export class SecretsService extends Effect.Tag("SecretsService")<
	SecretsService,
	ISecretsService
>() {
	static Live = (secrets: SecretsConfig) =>
		Layer.succeed(SecretsService, {
			hydrateSecrets: (config: any, secretsConfig: SecretsConfig) =>
				Effect.gen(function* () {
					if (!config || typeof config !== "object" || !config.secrets) {
						return config;
					}

					try {
						const configString = JSON.stringify(config);
						let hydratedString = configString;

						// Use provided secrets or fallback to secretsConfig
						const effectiveSecrets = { ...secretsConfig, ...secrets };

						// Simple template replacement for {{SECRET_NAME}} patterns
						for (const [key, value] of Object.entries(effectiveSecrets)) {
							const pattern = new RegExp(`{{${key}}}`, "g");
							hydratedString = hydratedString.replace(pattern, value);
						}

						return JSON.parse(hydratedString);
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

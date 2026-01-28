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

		const hydrateValue = (value: unknown): unknown => {
			if (typeof value === 'string') {
				let result = value;
				for (const [key, secretValue] of Object.entries(secrets)) {
					const pattern = new RegExp(`{{${key}}}`, "g");
					result = result.replace(pattern, String(secretValue));
				}
				return result;
			}

			if (Array.isArray(value)) {
				return value.map(hydrateValue);
			}

			if (value && typeof value === 'object') {
				const isPlainObject = value.constructor === Object || value.constructor === undefined;
				
				if (isPlainObject) {
					const hydrated: Record<string, unknown> = {};
					for (const [key, val] of Object.entries(value)) {
						hydrated[key] = hydrateValue(val);
					}
					return hydrated;
				}

				const hydrated = Object.create(Object.getPrototypeOf(value));
				for (const [key, val] of Object.entries(value)) {
					hydrated[key] = hydrateValue(val);
				}
				return hydrated;
			}

			return value;
		};

		return {
			hydrateSecrets: <T>(config: T) =>
				Effect.gen(function* () {
					const parseResult = configSchema.parse(config);
					try {
						return hydrateValue(parseResult) as T;
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

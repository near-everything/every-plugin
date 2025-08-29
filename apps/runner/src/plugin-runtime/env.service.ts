import type { JSONSchemaType } from "ajv/dist/2020";
import { Context, Effect, Layer, Redacted } from "effect";
import Mustache from "mustache";
import { EnvironmentError } from "../pipeline/errors";
import { SecretsConfigTag } from "./secrets.config";

export interface EnvironmentService {
  readonly hydrateSecrets: <T>(
    config: T,
    schema: JSONSchemaType<any>
  ) => Effect.Effect<T, EnvironmentError>;
}

export const EnvironmentServiceTag = Context.GenericTag<EnvironmentService>(
  "EnvironmentService"
);

export const createEnvironmentService = (
  secretsToHydrate: ReadonlyArray<string>
): EnvironmentService => {
  // Build the envMapping once when the service is created
  const envMapping: Record<string, Redacted.Redacted<string>> = {};
  for (const secretName of secretsToHydrate) {
    const value = process.env[secretName];
    if (value !== undefined) {
      envMapping[secretName] = Redacted.make(value);
    }
  }
  const availableSecretNames = Object.keys(envMapping);

  return {
    hydrateSecrets: <T>(
      config: T,
      schema: JSONSchemaType<any>
    ): Effect.Effect<T, EnvironmentError> =>
      Effect.gen(function* () {

        // Check if config has a secrets property
        const configObj = config as any;
        if (!configObj || typeof configObj !== 'object' || !configObj.secrets) {
          // No secrets to hydrate, return config as-is
          return config;
        }

        const stringifiedSecrets = yield* Effect.try({
          try: () => JSON.stringify(configObj.secrets),
          catch: (error) =>
            new EnvironmentError({
              message: `Failed to stringify secrets: ${error instanceof Error ? error.message : String(error)}`,
              operation: "parse-template",
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        });

        const tokens = Mustache.parse(stringifiedSecrets);
        const templateVars = new Set(
          tokens
            .filter((token) => token[0] === "name")
            .map((token) => token[1])
        );

        yield* validateRequiredSecrets(
          templateVars,
          availableSecretNames
        );

        const view: Record<string, any> = {};
        for (const templateVar of templateVars) {
          if (availableSecretNames.includes(templateVar) && envMapping[templateVar]) {
            view[templateVar] = Redacted.value(envMapping[templateVar]);
          } else {
            view[templateVar] = `{{${templateVar}}}`;
          }
        }

        const populatedSecretsString = Mustache.render(stringifiedSecrets, view);

        const hydratedSecrets = yield* Effect.try({
          try: () => JSON.parse(populatedSecretsString),
          catch: (error) =>
            new EnvironmentError({
              message: `Failed to parse hydrated secrets: ${error instanceof Error ? error.message : String(error)}`,
              operation: "parse-template",
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        });

        // Return the config with only the secrets hydrated
        return {
          ...configObj,
          secrets: hydratedSecrets
        } as T;
      }),
  };
};

// Validate that required secrets are available
const validateRequiredSecrets = (
  templateVars: Set<string>,
  availableSecrets: string[]
): Effect.Effect<void, EnvironmentError> =>
  Effect.gen(function* () {
    const missingRequiredSecrets: string[] = [];

    // Check if any template variable is missing from available secrets
    for (const templateVar of templateVars) {
      if (!availableSecrets.includes(templateVar)) {
        missingRequiredSecrets.push(templateVar);
      }
    }

    if (missingRequiredSecrets.length > 0) {
      return yield* Effect.fail(new EnvironmentError({
        message: `Missing required secrets: ${missingRequiredSecrets.join(', ')}`,
        operation: "validate-secrets",
        context: {
          missingSecrets: missingRequiredSecrets,
          availableSecrets: availableSecrets,
          templateVars: Array.from(templateVars)
        }
      }));
    }
  });

export const EnvironmentServiceLive = Layer.effect(
  EnvironmentServiceTag,
  Effect.gen(function* () {
    const config = yield* SecretsConfigTag;
    return createEnvironmentService(config.secretNames);
  })
);

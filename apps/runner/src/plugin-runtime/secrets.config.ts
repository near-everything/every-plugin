import { Config, Context, Layer } from "effect";

export interface SecretsConfig {
  readonly secretNames: ReadonlyArray<string>;
}

export const SecretsConfigTag = Context.GenericTag<SecretsConfig>('SecretsConfig');

export const SecretsConfigSchema = Config.all({
  secretNames: Config.array(Config.string(), "PIPELINE_SECRETS_TO_HYDRATE"),
});

export const SecretsConfigLive = Layer.effect(
  SecretsConfigTag,
  SecretsConfigSchema
);

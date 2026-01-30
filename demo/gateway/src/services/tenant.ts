import { Context, Effect, Layer } from "effect";
import { TenantNotFoundError } from "../errors";
import { extractAccount } from "../utils";
import { CacheServiceTag } from "./cache";
import { type BosConfig, ConfigServiceTag } from "./config";
import { SecretsServiceTag } from "./secrets";

const CACHE_TTL_SECONDS = 60;

export interface TenantContext {
  subdomain: string | null;
  nearAccount: string;
  config: BosConfig;
  secrets: Record<string, string>;
}

export interface GatewayEnv {
  GATEWAY_DOMAIN: string;
  GATEWAY_ACCOUNT: string;
  NOVA_API_KEY?: string;
}

export interface TenantService {
  resolve: (
    hostname: string,
    env: GatewayEnv
  ) => Effect.Effect<TenantContext, TenantNotFoundError>;
}

export class TenantServiceTag extends Context.Tag("TenantService")<
  TenantServiceTag,
  TenantService
>() {}

export const TenantServiceLive = Layer.effect(
  TenantServiceTag,
  Effect.gen(function* () {
    const cache = yield* CacheServiceTag;
    const configService = yield* ConfigServiceTag;
    const secretsService = yield* SecretsServiceTag;

    return TenantServiceTag.of({
      resolve: (hostname: string, env: GatewayEnv) =>
        Effect.gen(function* () {
          const cacheKey = `tenant:${hostname}`;

          const cached = yield* cache.get<TenantContext>(cacheKey);
          if (cached) {
            console.log(`[Gateway] Cache hit for ${hostname}`);
            return cached;
          }

          console.log(`[Gateway] Cache miss for ${hostname}, resolving...`);

          const resolution = extractAccount(
            hostname,
            env.GATEWAY_DOMAIN,
            env.GATEWAY_ACCOUNT
          );

          if (!resolution) {
            return yield* Effect.fail(
              new TenantNotFoundError({
                hostname,
                message: `Unable to resolve account for ${hostname}`,
              })
            );
          }

          const { subdomain, nearAccount } = resolution;

          const [configResult, secretsRefResult] = yield* Effect.all(
            [
              configService.fetchConfig(nearAccount, env.GATEWAY_DOMAIN).pipe(
                Effect.either
              ),
              configService.fetchSecretsRef(nearAccount, env.GATEWAY_DOMAIN),
            ],
            { concurrency: "unbounded" }
          );

          if (configResult._tag === "Left") {
            return yield* Effect.fail(
              new TenantNotFoundError({
                hostname,
                message: `No configuration found for ${nearAccount}`,
              })
            );
          }

          const config = configResult.right;
          let secrets: Record<string, string> = {};

          if (env.NOVA_API_KEY && secretsRefResult) {
            const requiredKeys = configService.getAllRequiredSecrets(config);

            const secretsResult = yield* secretsService
              .fetchSecrets(secretsRefResult, env.NOVA_API_KEY)
              .pipe(Effect.either);

            if (secretsResult._tag === "Right") {
              secrets = secretsService.filterSecrets(secretsResult.right, requiredKeys);
            } else {
              console.warn(
                `[Gateway] Failed to fetch secrets for ${nearAccount}: ${secretsResult.left.message}`
              );
            }
          }

          const tenant: TenantContext = {
            subdomain,
            nearAccount,
            config,
            secrets,
          };

          yield* cache.set(cacheKey, tenant, CACHE_TTL_SECONDS);

          return tenant;
        }),
    });
  })
);

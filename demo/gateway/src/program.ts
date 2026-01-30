import { type Container } from "@cloudflare/containers";
import { Effect, Layer } from "effect";
import { TenantNotFoundError } from "./errors";
import { CacheServiceLive } from "./services/cache";
import { ConfigServiceLive } from "./services/config";
import { type ContainerEnv, ContainerServiceLive, ContainerServiceTag } from "./services/container";
import { SecretsServiceLive } from "./services/secrets";
import { type GatewayEnv, TenantServiceLive, TenantServiceTag } from "./services/tenant";

export interface Env extends GatewayEnv, ContainerEnv {
  TENANT_CONTAINER: DurableObjectNamespace<Container>;
  GATEWAY_DOMAIN: string;
  GATEWAY_ACCOUNT: string;
  NOVA_API_KEY?: string;
}

const BaseLive = Layer.mergeAll(
  CacheServiceLive,
  ConfigServiceLive,
  SecretsServiceLive,
  ContainerServiceLive
);

const TenantLive = TenantServiceLive.pipe(
  Layer.provide(BaseLive)
);

const GatewayLive = Layer.merge(BaseLive, TenantLive);

const handleRequest = (request: Request, env: Env) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    const hostname = url.hostname;

    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    if (url.pathname === "/_gateway/info") {
      return Response.json({
        gateway: env.GATEWAY_DOMAIN,
        account: env.GATEWAY_ACCOUNT,
      });
    }

    const tenantService = yield* TenantServiceTag;
    const containerService = yield* ContainerServiceTag;

    const tenant = yield* tenantService.resolve(hostname, env);

    const container = yield* containerService.getOrStart(tenant, env);

    const response = yield* containerService.proxy(container, request, tenant);

    return response;
  });

export const runGateway = (request: Request, env: Env): Promise<Response> => {
  const program = handleRequest(request, env).pipe(
    Effect.catchTag("TenantNotFoundError", (error: TenantNotFoundError) =>
      Effect.succeed(
        new Response(
          JSON.stringify({
            error: "Tenant not found",
            message: error.message,
            hint: `Publish your bos.config.json to social.near using 'bos publish'`,
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
    ),
    Effect.catchTag("ContainerStartError", (error) =>
      Effect.succeed(
        new Response(
          JSON.stringify({
            error: "Container start error",
            message: `Failed to start container for tenant`,
            account: error.account,
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
    ),
    Effect.catchTag("ContainerFetchError", (error) =>
      Effect.succeed(
        new Response(
          JSON.stringify({
            error: "Container error",
            message: `Failed to route request to tenant container`,
            account: error.account,
          }),
          {
            status: 502,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
    ),
    Effect.catchAllDefect((defect) =>
      Effect.succeed(
        new Response(
          JSON.stringify({
            error: "Internal error",
            message: defect instanceof Error ? defect.message : String(defect),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
    ),
    Effect.provide(GatewayLive)
  );

  return Effect.runPromise(program);
};

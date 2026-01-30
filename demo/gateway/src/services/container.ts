import { type Container, getContainer } from "@cloudflare/containers";
import { Context, Effect, Layer } from "effect";
import { ContainerFetchError, ContainerStartError } from "../errors";
import type { TenantContext } from "./tenant";

type ContainerStub = DurableObjectStub<Container>;

export interface ContainerEnv {
  TENANT_CONTAINER: DurableObjectNamespace<Container>;
  GATEWAY_DOMAIN: string;
}

export interface ContainerService {
  getOrStart: (
    tenant: TenantContext,
    env: ContainerEnv
  ) => Effect.Effect<ContainerStub, ContainerStartError>;
  proxy: (
    container: ContainerStub,
    request: Request,
    tenant: TenantContext
  ) => Effect.Effect<Response, ContainerFetchError>;
}

export class ContainerServiceTag extends Context.Tag("ContainerService")<
  ContainerServiceTag,
  ContainerService
>() {}

export const ContainerServiceLive = Layer.succeed(
  ContainerServiceTag,
  ContainerServiceTag.of({
    getOrStart: (tenant: TenantContext, env: ContainerEnv) =>
      Effect.gen(function* () {
        const container = getContainer(env.TENANT_CONTAINER, tenant.nearAccount);

        const envVars: Record<string, string> = {
          BOS_ACCOUNT: tenant.nearAccount,
          GATEWAY_DOMAIN: env.GATEWAY_DOMAIN,
          NODE_ENV: "production",
        };

        for (const [key, value] of Object.entries(tenant.secrets)) {
          envVars[key] = value;
        }

        console.log(
          `[Gateway] Starting container for ${tenant.nearAccount} with env:`,
          Object.keys(envVars)
        );

        yield* Effect.tryPromise({
          try: () =>
            container.startAndWaitForPorts({
              startOptions: { envVars },
            }),
          catch: (error) =>
            new ContainerStartError({
              account: tenant.nearAccount,
              cause: error,
            }),
        }).pipe(
          Effect.catchAll((error) => {
            console.warn(
              `[Gateway] Container start warning for ${tenant.nearAccount}:`,
              error
            );
            return Effect.void;
          })
        );

        return container;
      }),

    proxy: (container: ContainerStub, request: Request, tenant: TenantContext) =>
      Effect.gen(function* () {
        const headers = new Headers(request.headers);
        headers.set("X-Bos-Account", tenant.nearAccount);
        headers.set("X-Bos-Config", JSON.stringify(tenant.config));

        const proxiedRequest = new Request(request.url, {
          method: request.method,
          headers,
          body: request.body,
          redirect: "manual",
          duplex: "half",
        } as RequestInit);

        const response = yield* Effect.tryPromise({
          try: () => container.fetch(proxiedRequest),
          catch: (error) =>
            new ContainerFetchError({
              account: tenant.nearAccount,
              cause: error,
            }),
        });

        return response;
      }),
  })
);

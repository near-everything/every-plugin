import { Container, getContainer } from "@cloudflare/containers";
import {
  type BosConfig,
  fetchSecretsReference,
  fetchTenantConfig,
  getAllRequiredSecrets,
} from "./config";
import { fetchSecretsFromNova, filterSecrets } from "./secrets";
import { extractAccount } from "./utils";

export { TenantContainer } from "./container";

export interface Env {
  TENANT_CONTAINER: DurableObjectNamespace<Container>;
  GATEWAY_DOMAIN: string;
  GATEWAY_ACCOUNT: string;
  NOVA_SESSION_TOKEN?: string;
}

interface TenantContext {
  account: string;
  nearAccount: string;
  config: BosConfig;
  secrets: Record<string, string>;
}

async function resolveTenant(
  hostname: string,
  env: Env
): Promise<TenantContext | null> {
  const resolution = extractAccount(hostname, env.GATEWAY_DOMAIN);
  if (!resolution) {
    return null;
  }

  const { account, nearAccount } = resolution;

  const config = await fetchTenantConfig(nearAccount, env.GATEWAY_DOMAIN);
  if (!config) {
    return null;
  }

  let secrets: Record<string, string> = {};

  if (env.NOVA_SESSION_TOKEN) {
    const secretsRef = await fetchSecretsReference(nearAccount, env.GATEWAY_DOMAIN);
    if (secretsRef) {
      const requiredKeys = getAllRequiredSecrets(config);
      const novaResult = await fetchSecretsFromNova(secretsRef, env.NOVA_SESSION_TOKEN);

      if (novaResult.error) {
        console.warn(`[Gateway] Failed to fetch secrets for ${account}: ${novaResult.error}`);
      } else {
        secrets = filterSecrets(novaResult.secrets, requiredKeys);
      }
    }
  }

  return {
    account,
    nearAccount,
    config,
    secrets,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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

    const tenant = await resolveTenant(hostname, env);

    if (!tenant) {
      return new Response(
        JSON.stringify({
          error: "Tenant not found",
          message: `No configuration found for ${hostname}`,
          hint: `Publish your bos.config.json to FastFS for your account`,
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const container = getContainer(env.TENANT_CONTAINER, tenant.account);

    const headers = new Headers(request.headers);
    headers.set("X-Bos-Config", JSON.stringify(tenant.config));
    headers.set("X-Bos-Account", tenant.nearAccount);

    if (Object.keys(tenant.secrets).length > 0) {
      headers.set("X-Bos-Secrets", JSON.stringify(tenant.secrets));
    }

    const proxiedRequest = new Request(request.url, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    });

    try {
      return await container.fetch(proxiedRequest);
    } catch (error) {
      console.error(`[Gateway] Container error for ${tenant.account}:`, error);

      return new Response(
        JSON.stringify({
          error: "Container error",
          message: `Failed to route request to tenant container`,
          account: tenant.account,
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};

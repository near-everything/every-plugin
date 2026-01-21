import { type Container, getContainer } from "@cloudflare/containers";
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
  subdomain: string | null;
  nearAccount: string;
  config: BosConfig;
  secrets: Record<string, string>;
}

async function resolveTenant(
  hostname: string,
  env: Env
): Promise<TenantContext | null> {
  const resolution = extractAccount(hostname, env.GATEWAY_DOMAIN, env.GATEWAY_ACCOUNT);
  if (!resolution) {
    return null;
  }

  const { subdomain, nearAccount } = resolution;

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
        console.warn(`[Gateway] Failed to fetch secrets for ${nearAccount}: ${novaResult.error}`);
      } else {
        secrets = filterSecrets(novaResult.secrets, requiredKeys);
      }
    }
  }

  return {
    subdomain,
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
          hint: `Publish your bos.config.json to social.near using 'bos publish'`,
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const container = getContainer(env.TENANT_CONTAINER, tenant.nearAccount);

    const envVars: Record<string, string> = {
      BOS_ACCOUNT: tenant.nearAccount,
      GATEWAY_DOMAIN: env.GATEWAY_DOMAIN,
      NODE_ENV: "production",
    };

    for (const [key, value] of Object.entries(tenant.secrets)) {
      envVars[key] = value;
    }

    try {
      await container.startAndWaitForPorts({
        startOptions: { envVars },
      });
    } catch (startError) {
      console.warn(`[Gateway] Container start warning for ${tenant.nearAccount}:`, startError);
    }

    const headers = new Headers(request.headers);
    headers.set("X-Bos-Account", tenant.nearAccount);

    const proxiedRequest = new Request(request.url, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    });

    try {
      return await container.fetch(proxiedRequest);
    } catch (error) {
      console.error(`[Gateway] Container error for ${tenant.nearAccount}:`, error);

      return new Response(
        JSON.stringify({
          error: "Container error",
          message: `Failed to route request to tenant container`,
          account: tenant.nearAccount,
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};

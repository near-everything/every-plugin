import { Container } from "@cloudflare/containers";
import type { Env } from "./worker";

export class TenantContainer extends Container {
  declare env: Env;

  defaultPort = 3000;
  sleepAfter = "10m";

  envVars: Record<string, string> = {
    NODE_ENV: "production",
  };

  override onStart() {
    console.log(`[Container] Tenant container started`);
  }

  override onStop() {
    console.log(`[Container] Tenant container stopped`);
  }

  override onError(error: unknown) {
    console.error(`[Container] Error:`, error);
  }
}

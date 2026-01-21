import { type Container } from "@cloudflare/containers";
import { type Env, runGateway } from "./program";

export { TenantContainer } from "./container";

export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return runGateway(request, env);
  },
};

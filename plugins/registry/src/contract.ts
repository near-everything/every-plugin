import { oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

export const contract = oc.router({
  publish: oc
    .route({ method: 'POST', path: '/publish' })
    .input(z.object({
      payload: z.string().describe("Base64 encoded signed delegate action")
    }))
    .output(z.object({
      hash: z.string().describe("Transaction hash")
    })),

  ping: oc
    .route({ method: 'GET', path: '/ping' })
    .output(z.object({
      status: z.literal('ok'),
      timestamp: z.string().datetime(),
    })),
});

import { oc } from 'every-plugin/orpc';
import { z } from 'every-plugin/zod';

export const contract = oc.router({
  ping: oc
    .route({ method: 'GET', path: '/ping' })
    .output(z.object({
      status: z.literal('ok'),
      timestamp: z.iso.datetime(),
    })),

  protected: oc
    .route({ method: 'GET', path: '/protected' })
    .output(z.object({
      message: z.string(),
      accountId: z.string(),
      timestamp: z.iso.datetime(),
    })),

  getValue: oc
    .route({ method: 'GET', path: '/kv/{key}' })
    .input(z.object({
      key: z.string(),
    }))
    .output(z.object({
      key: z.string(),
      value: z.string(),
      updatedAt: z.iso.datetime(),
    })),

  setValue: oc
    .route({ method: 'POST', path: '/kv/{key}' })
    .input(z.object({
      key: z.string(),
      value: z.string(),
    }))
    .output(z.object({
      key: z.string(),
      value: z.string(),
      created: z.boolean(),
    })),
});

export type ContractType = typeof contract;

import { NOT_FOUND, FORBIDDEN, UNAUTHORIZED } from 'every-plugin/errors';
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
    }))
    .errors({ UNAUTHORIZED }),

  listKeys: oc
    .route({ method: 'GET', path: '/kv' })
    .input(z.object({
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    }))
    .output(z.object({
      keys: z.array(z.object({
        key: z.string(),
        updatedAt: z.iso.datetime(),
      })),
      total: z.number(),
      hasMore: z.boolean(),
    }))
    .errors({ UNAUTHORIZED }),

  getValue: oc
    .route({ method: 'GET', path: '/kv/{key}' })
    .input(z.object({
      key: z.string(),
    }))
    .output(z.object({
      key: z.string(),
      value: z.string(),
      updatedAt: z.iso.datetime(),
    }))
    .errors({ NOT_FOUND, FORBIDDEN, UNAUTHORIZED }),

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
    }))
    .errors({ FORBIDDEN, UNAUTHORIZED }),

  deleteKey: oc
    .route({ method: 'DELETE', path: '/kv/{key}' })
    .input(z.object({
      key: z.string(),
    }))
    .output(z.object({
      key: z.string(),
      deleted: z.boolean(),
    }))
    .errors({ NOT_FOUND, FORBIDDEN, UNAUTHORIZED }),
});

export type ContractType = typeof contract;

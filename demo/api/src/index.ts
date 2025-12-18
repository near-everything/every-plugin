import { createPlugin } from 'every-plugin';
import { Effect } from 'every-plugin/effect';
import { ORPCError } from 'every-plugin/orpc';
import { z } from 'every-plugin/zod';
import { contract } from './contract';
import { Database, DatabaseLive } from './store';
import { kvStore } from './db/schema';
import { eq } from 'drizzle-orm';

export default createPlugin({
  variables: z.object({
  }),

  secrets: z.object({
    DATABASE_URL: z.string().default('file:./api.db'),
    DATABASE_AUTH_TOKEN: z.string().optional(),
  }),

  context: z.object({
    nearAccountId: z.string().optional(),
  }),

  contract,

  initialize: (config) =>
    Effect.gen(function* () {
      const dbLayer = DatabaseLive(config.secrets.DATABASE_URL, config.secrets.DATABASE_AUTH_TOKEN);
      const db = yield* Effect.provide(Database, dbLayer);

      console.log('[API] Plugin initialized');

      return { db };
    }),

  shutdown: (context) =>
    Effect.gen(function* () {
      console.log('[API] Plugin shutting down');
    }),

  createRouter: (context, builder) => {
    const { db } = context;

    const requireAuth = builder.middleware(async ({ context, next }) => {
      if (!context.nearAccountId) {
        throw new ORPCError('UNAUTHORIZED', {
          message: 'Authentication required',
          data: { authType: 'nearAccountId' }
        });
      }
      return next({
        context: {
          nearAccountId: context.nearAccountId,
        }
      });
    });

    return {
      ping: builder.ping.handler(async () => {
        return {
          status: 'ok' as const,
          timestamp: new Date().toISOString(),
        };
      }),

      protected: builder.protected
        .use(requireAuth)
        .handler(async ({ context }) => {
          return {
            message: 'This is a protected endpoint',
            accountId: context.nearAccountId,
            timestamp: new Date().toISOString(),
          };
        }),

      getValue: builder.getValue
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          const [record] = await db
            .select()
            .from(kvStore)
            .where(eq(kvStore.key, input.key))
            .limit(1);

          if (!record) {
            throw new ORPCError('NOT_FOUND', {
              message: 'Key not found',
            });
          }

          if (record.nearAccountId !== context.nearAccountId) {
            throw new ORPCError('FORBIDDEN', {
              message: 'Access denied',
            });
          }

          return {
            key: record.key,
            value: record.value,
            updatedAt: record.updatedAt.toISOString(),
          };
        }),

      setValue: builder.setValue
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          const now = new Date();
          
          const [existing] = await db
            .select()
            .from(kvStore)
            .where(eq(kvStore.key, input.key))
            .limit(1);

          let created = false;

          if (existing) {
            if (existing.nearAccountId !== context.nearAccountId) {
              throw new ORPCError('FORBIDDEN', {
                message: 'Access denied',
              });
            }

            await db
              .update(kvStore)
              .set({
                value: input.value,
                updatedAt: now,
              })
              .where(eq(kvStore.key, input.key));
          } else {
            await db.insert(kvStore).values({
              key: input.key,
              value: input.value,
              nearAccountId: context.nearAccountId,
              createdAt: now,
              updatedAt: now,
            });
            created = true;
          }

          return {
            key: input.key,
            value: input.value,
            created,
          };
        }),
    }
  },
});

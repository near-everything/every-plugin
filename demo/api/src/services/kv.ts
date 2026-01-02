import { count, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { DatabaseTag } from "../db/layer";
import { kvStore } from "../db/schema";

export class KvService extends Context.Tag("KvService")<
  KvService,
  {
    listKeys: (
      owner: string,
      limit?: number,
      offset?: number
    ) => Effect.Effect<{
      keys: Array<{ key: string; updatedAt: string }>;
      total: number;
      hasMore: boolean;
    }, ORPCError<string, unknown>>;

    getValue: (
      key: string,
      owner: string
    ) => Effect.Effect<{ key: string; value: string; updatedAt: string }, ORPCError<string, unknown>>;

    setValue: (
      key: string,
      value: string,
      owner: string
    ) => Effect.Effect<{ key: string; value: string; created: boolean }, ORPCError<string, unknown>>;

    deleteKey: (
      key: string,
      owner: string
    ) => Effect.Effect<{ key: string; deleted: boolean }, ORPCError<string, unknown>>;
  }
>() {}

export const KvServiceLive = Layer.effect(
  KvService,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    return {
      listKeys: (owner, limit = 20, offset = 0) =>
        Effect.gen(function* () {
          const [totalResult] = yield* Effect.promise(() =>
            db
              .select({ count: count() })
              .from(kvStore)
              .where(eq(kvStore.nearAccountId, owner))
          );

          const total = totalResult?.count ?? 0;

          const records = yield* Effect.promise(() =>
            db
              .select({ key: kvStore.key, updatedAt: kvStore.updatedAt })
              .from(kvStore)
              .where(eq(kvStore.nearAccountId, owner))
              .orderBy(desc(kvStore.updatedAt))
              .limit(limit)
              .offset(offset)
          );

          return {
            keys: records.map((r) => ({
              key: r.key,
              updatedAt: r.updatedAt.toISOString(),
            })),
            total,
            hasMore: offset + records.length < total,
          };
        }),

      getValue: (key, owner) =>
        Effect.gen(function* () {
          const [record] = yield* Effect.promise(() =>
            db.select().from(kvStore).where(eq(kvStore.key, key)).limit(1)
          );

          if (!record) {
            return yield* Effect.fail(
              new ORPCError("NOT_FOUND", { message: "Key not found" })
            );
          }

          if (record.nearAccountId !== owner) {
            return yield* Effect.fail(
              new ORPCError("FORBIDDEN", { message: "Access denied" })
            );
          }

          return {
            key: record.key,
            value: record.value,
            updatedAt: record.updatedAt.toISOString(),
          };
        }),

      setValue: (key, value, owner) =>
        Effect.gen(function* () {
          const now = new Date();
          const [existing] = yield* Effect.promise(() =>
            db.select().from(kvStore).where(eq(kvStore.key, key)).limit(1)
          );

          let created = false;

          if (existing) {
            if (existing.nearAccountId !== owner) {
              return yield* Effect.fail(
                new ORPCError("FORBIDDEN", { message: "Access denied" })
              );
            }
            yield* Effect.promise(() =>
              db
                .update(kvStore)
                .set({ value, updatedAt: now })
                .where(eq(kvStore.key, key))
            );
          } else {
            yield* Effect.promise(() =>
              db.insert(kvStore).values({
                key,
                value,
                nearAccountId: owner,
                createdAt: now,
                updatedAt: now,
              })
            );
            created = true;
          }

          return { key, value, created };
        }),

      deleteKey: (key, owner) =>
        Effect.gen(function* () {
          const [record] = yield* Effect.promise(() =>
            db.select().from(kvStore).where(eq(kvStore.key, key)).limit(1)
          );

          if (!record) {
            return yield* Effect.fail(
              new ORPCError("NOT_FOUND", { message: "Key not found" })
            );
          }

          if (record.nearAccountId !== owner) {
            return yield* Effect.fail(
              new ORPCError("FORBIDDEN", { message: "Access denied" })
            );
          }

          yield* Effect.promise(() =>
            db.delete(kvStore).where(eq(kvStore.key, key))
          );

          return { key, deleted: true };
        }),
    };
  })
);

import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { DatabaseTag } from "../db/layer";
import { kvStore } from "../db/schema";

export class KvService extends Context.Tag("KvService")<
  KvService,
  {
    getValue: (
      key: string,
      owner: string
    ) => Effect.Effect<{ key: string; value: string; updatedAt: string }, ORPCError<string, unknown>>;

    setValue: (
      key: string,
      value: string,
      owner: string
    ) => Effect.Effect<{ key: string; value: string; created: boolean }, ORPCError<string, unknown>>;
  }
>() {}

export const KvServiceLive = Layer.effect(
  KvService,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    return {
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
    };
  })
);

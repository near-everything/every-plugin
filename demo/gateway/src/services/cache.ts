import { Context, Effect, Layer } from "effect";

const CACHE_NAME = "tenant-config";
const CACHE_PREFIX = "https://gateway-internal";

export interface CacheService {
  get: <T>(key: string) => Effect.Effect<T | null>;
  set: <T>(key: string, value: T, ttlSeconds: number) => Effect.Effect<void>;
  delete: (key: string) => Effect.Effect<void>;
}

export class CacheServiceTag extends Context.Tag("CacheService")<
  CacheServiceTag,
  CacheService
>() {}

const makeCacheKey = (key: string): string => `${CACHE_PREFIX}/${key}`;

export const CacheServiceLive = Layer.succeed(
  CacheServiceTag,
  CacheServiceTag.of({
    get: <T>(key: string) =>
      Effect.gen(function* () {
        const cache = yield* Effect.promise(() => caches.open(CACHE_NAME));
        const cacheKey = makeCacheKey(key);
        const cached = yield* Effect.promise(() => cache.match(cacheKey));

        if (!cached) {
          return null;
        }

        const data = yield* Effect.promise(() => cached.json() as Promise<T>);
        return data;
      }).pipe(
        Effect.catchAll(() => Effect.succeed(null))
      ),

    set: <T>(key: string, value: T, ttlSeconds: number) =>
      Effect.gen(function* () {
        const cache = yield* Effect.promise(() => caches.open(CACHE_NAME));
        const cacheKey = makeCacheKey(key);

        const response = new Response(JSON.stringify(value), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `max-age=${ttlSeconds}`,
          },
        });

        yield* Effect.promise(() => cache.put(cacheKey, response));
      }).pipe(
        Effect.catchAll(() => Effect.void)
      ),

    delete: (key: string) =>
      Effect.gen(function* () {
        const cache = yield* Effect.promise(() => caches.open(CACHE_NAME));
        const cacheKey = makeCacheKey(key);
        yield* Effect.promise(() => cache.delete(cacheKey));
      }).pipe(
        Effect.catchAll(() => Effect.void)
      ),
  })
);

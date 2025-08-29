import { Context, Effect, Layer, Redacted } from 'effect';
import { Redis as IORedis } from 'ioredis';
import { AppConfig } from '../../config';

export interface RedisClient {
  readonly client: IORedis;
}

export const RedisClient = Context.GenericTag<RedisClient>("RedisClient");

export const RedisClientLive = Layer.scoped(
  RedisClient,
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const redisUrl = Redacted.value(config.redisUrl);

    const client = yield* Effect.acquireRelease(
      Effect.sync(() => {
        console.log("Redis client created.");
        return new IORedis(redisUrl);
      }),
      (client) =>
        Effect.promise(() => {
          console.log("Redis client closing...");
          return client.quit();
        }).pipe(
          Effect.catchAllDefect((error) =>
            Effect.logError(`Error closing Redis client: ${error}`)
          )
        )
    );

    return { client };
  })
);

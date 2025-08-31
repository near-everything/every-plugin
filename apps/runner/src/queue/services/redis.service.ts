import { redis } from "bun";
import { Context, Effect, Layer } from "effect";

export interface RedisClient {
	readonly client: typeof redis;
}

export const RedisClient = Context.GenericTag<RedisClient>("RedisClient");

export const RedisClientLive = Layer.effect(
	RedisClient,
	Effect.succeed({ client: redis }),
);

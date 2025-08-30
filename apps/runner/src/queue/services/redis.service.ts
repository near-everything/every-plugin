import { RedisClient as BunRedisClient } from "bun";
import { Context, Effect, Layer, Redacted } from "effect";
import { AppConfig } from "../../config";

export interface RedisClient {
	readonly client: BunRedisClient;
}

export const RedisClient = Context.GenericTag<RedisClient>("RedisClient");

export const RedisClientLive = Layer.scoped(
	RedisClient,
	Effect.gen(function* () {
		const config = yield* AppConfig;
		const redisUrl = Redacted.value(config.redisUrl);

		const client = yield* Effect.acquireRelease(
			Effect.sync(() => {
				console.log("Creating Redis client for Railway...");

				const redisClient = new BunRedisClient(redisUrl, {
					connectionTimeout: 30000, // 30s timeout for Railway's network
					autoReconnect: true,
					maxRetries: 10,
					enableOfflineQueue: true,
					enableAutoPipelining: true,
				});

				// Add connection event handlers for Railway debugging
				redisClient.onconnect = () => {
					console.log('✅ Redis client connected to Railway');
				};

				redisClient.onclose = (error) => {
					if (error) {
						console.error('❌ Redis connection closed with error:', error.message);
					} else {
						console.log('Redis connection closed');
					}
				};

				return redisClient;
			}),
			(client) =>
				Effect.sync(() => {
					console.log("Closing Redis client...");
					client.close();
				}),
		);

		return { client };
	}),
);

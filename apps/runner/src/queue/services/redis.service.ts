import { Context, Effect, Layer, Redacted } from "effect";
import { Redis as IORedis } from "ioredis";
import { AppConfig } from "../../config";

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
				console.log("Creating Redis client...");
				const redisClient = new IORedis(`${redisUrl}?family=0`, {
					// family: 0, // Enable dual stack lookup (IPv4 and IPv6)
					connectTimeout: 30000, // 30s network timeout
					commandTimeout: 10000, // 10s command timeout
					lazyConnect: true, // Don't connect immediately
					enableAutoPipelining: false,
					maxRetriesPerRequest: 5,

					retryStrategy(times) {
						if (times > 3) return null; // Stop after 3 command retries
						const delay = Math.min(times * 100, 1000);
						return delay;
					},
				});

				redisClient.on('connect', () => {
					console.log('Redis client connecting to Railway...');
				});

				redisClient.on('ready', () => {
					console.log('✅ Redis client connected and ready (Railway)');
				});

				redisClient.on('error', (error) => {
					console.error('❌ Redis client error:', error.message);
				}
				);

				redisClient.on('end', () => {
					console.log('Redis connection ended');
				});

				return redisClient;
			}),
			(client) =>
				Effect.promise(() => {
					console.log("Redis client closing...");
					return client.quit();
				}).pipe(
					Effect.catchAllDefect((error) =>
						Effect.logError(`Error closing Redis client: ${error}`),
					),
				),
		);

		return { client };
	}),
);

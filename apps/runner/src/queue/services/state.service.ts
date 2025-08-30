import { Context, Effect, Layer, Option, type Scope } from "effect";
import type { WebSocketEvent } from "../../interfaces";
import type { RedisKey } from "../constants/keys";
import { RedisKeys } from "../constants/keys";
import { RedisClient } from "./redis.service";

export interface StateService {
	// --- Generic Methods ---
	readonly get: <T>(key: RedisKey<T>) => Effect.Effect<Option.Option<T>, Error>;
	readonly set: <T>(key: RedisKey<T>, value: T) => Effect.Effect<void, Error>;
	readonly delete: (key: RedisKey<unknown>) => Effect.Effect<void, Error>;
	readonly getKeys: (pattern: string) => Effect.Effect<string[], Error>;

	// --- Pub/Sub Methods ---
	readonly publish: (event: WebSocketEvent) => Effect.Effect<void, Error>;
	readonly subscribe: (
		onMessage: (event: WebSocketEvent) => void,
	) => Effect.Effect<() => void, Error, Scope.Scope>;
}

export const StateService = Context.GenericTag<StateService>("StateService");

export const StateServiceLive = Layer.scoped(
	StateService,
	Effect.gen(function* () {
		const prefix = "workflow:state";
		const redis = yield* RedisClient;

		const createRedisClient = () =>
			redis.client.duplicate({
				keyPrefix: prefix,
				maxRetriesPerRequest: 3,
			});

		const client = yield* Effect.acquireRelease(
			Effect.sync(createRedisClient),
			(redis) => Effect.promise(() => redis.quit()),
		);

		const publisher = yield* Effect.acquireRelease(
			Effect.sync(createRedisClient),
			(redis) => Effect.promise(() => redis.quit()),
		);

		const get = <T>(key: RedisKey<T>) =>
			Effect.tryPromise({
				try: async () => {
					const result = await client.get(key.value);
					return result ? Option.some(JSON.parse(result) as T) : Option.none();
				},
				catch: (error) =>
					new Error(`Failed to GET state for ${key.value}: ${error}`),
			});

		const set = <T>(key: RedisKey<T>, value: T) =>
			Effect.asVoid(
				Effect.tryPromise({
					try: () => client.set(key.value, JSON.stringify(value)),
					catch: (error) =>
						new Error(`Failed to SET state for ${key.value}: ${error}`),
				}),
			);

		const del = (key: RedisKey<unknown>) =>
			Effect.asVoid(
				Effect.tryPromise({
					try: () => client.del(key.value),
					catch: (error) =>
						new Error(`Failed to DELETE state for ${key.value}: ${error}`),
				}),
			);

		const getKeys = (pattern: string) =>
			Effect.tryPromise({
				try: () => client.keys(`${prefix}:${pattern}`) as Promise<string[]>,
				catch: (error) =>
					new Error(`Failed to get KEYS for pattern ${pattern}: ${error}`),
			});

		const publish = (event: WebSocketEvent) =>
			Effect.tryPromise({
				try: () =>
					publisher.publish(
						RedisKeys.webSocketEventsChannel().value,
						JSON.stringify(event),
					),
				catch: (error) => new Error(`Failed to publish event: ${error}`),
			}).pipe(Effect.asVoid);

		const subscribe = (onMessage: (event: WebSocketEvent) => void) =>
			Effect.acquireRelease(Effect.sync(createRedisClient), (redis) =>
				Effect.promise(() => redis.quit()),
			).pipe(
				Effect.flatMap((subscriber) =>
					Effect.tryPromise({
						try: async () => {
							const channel = RedisKeys.webSocketEventsChannel().value;
							await subscriber.subscribe(channel);
							subscriber.on("message", (ch: string, message: string) => {
								if (ch === channel) {
									try {
										const event = JSON.parse(message) as WebSocketEvent;
										onMessage(event);
									} catch (e) {
										console.error(
											"Failed to parse WebSocket event from Redis",
											e,
										);
									}
								}
							});
							return () => {
								subscriber.unsubscribe(channel).catch(console.error);
							};
						},
						catch: (error) => new Error(`Failed to subscribe: ${error}`),
					}),
				),
			);

		return {
			get,
			set,
			delete: del,
			getKeys,
			publish,
			subscribe,
		};
	}),
);

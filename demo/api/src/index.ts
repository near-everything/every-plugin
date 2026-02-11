import { createPlugin } from "every-plugin";
import { Cause, Effect, Exit, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import { contract } from "./contract";
import { DatabaseLive } from "./db/layer";
import { KvService, KvServiceLive } from "./services/kv";

export default createPlugin({
	variables: z.object({}),

	secrets: z.object({
		API_DATABASE_URL: z.string().default("file:./api.db"),
		API_DATABASE_AUTH_TOKEN: z.string().optional(),
	}),

	context: z.object({
		nearAccountId: z.string().optional(),
	}),

	contract,

	initialize: (config) =>
		Effect.gen(function* () {
			const Database = DatabaseLive(
				config.secrets.API_DATABASE_URL,
				config.secrets.API_DATABASE_AUTH_TOKEN,
			);

			const Services = KvServiceLive.pipe(Layer.provide(Database));

			const services = yield* Effect.provide(KvService, Services);

			console.log("[API] Services Initialized");
			return services;
		}),

	shutdown: () => Effect.log("[API] Shutdown"),

	createRouter: (services, builder) => {
		const authed = builder.middleware(({ context, next }) => {
			if (!context.nearAccountId) {
				throw new ORPCError("UNAUTHORIZED", { message: "Auth required" });
			}
			return next({ context: { owner: context.nearAccountId } });
		});

		return {
			ping: builder.ping.handler(async () => ({
				status: "ok",
				timestamp: new Date().toISOString(),
			})),

			protected: builder.protected.use(authed).handler(async ({ context }) => ({
				message: "Protected data",
				accountId: context.owner,
				timestamp: new Date().toISOString(),
			})),

			listKeys: builder.listKeys
				.use(authed)
				.handler(async ({ input, context }) => {
					const exit = await Effect.runPromiseExit(
						services.listKeys(context.owner, input.limit, input.offset),
					);

					if (Exit.isFailure(exit)) {
						const squashed = Cause.squash(exit.cause);
						if (squashed instanceof ORPCError) {
							throw squashed;
						}
						throw new ORPCError("INTERNAL_SERVER_ERROR", {
							message:
								squashed instanceof Error ? squashed.message : String(squashed),
							data: {
								originalError:
									squashed instanceof Error
										? squashed.message
										: String(squashed),
							},
						});
					}

					return exit.value;
				}),

			getValue: builder.getValue
				.use(authed)
				.handler(async ({ input, context, errors }) => {
					const exit = await Effect.runPromiseExit(
						services.getValue(input.key, context.owner),
					);

					if (Exit.isFailure(exit)) {
						const squashed = Cause.squash(exit.cause);
						if (squashed instanceof ORPCError) {
							if (squashed.code === "NOT_FOUND") {
								throw errors.NOT_FOUND({
									message: "Key not found",
									data: { resource: "kv", resourceId: input.key },
								});
							}
							if (squashed.code === "FORBIDDEN") {
								throw errors.FORBIDDEN({
									message: "Access denied",
									data: { action: "read" },
								});
							}
							throw squashed;
						}
						throw new ORPCError("INTERNAL_SERVER_ERROR", {
							message:
								squashed instanceof Error ? squashed.message : String(squashed),
							data: {
								originalError:
									squashed instanceof Error
										? squashed.message
										: String(squashed),
							},
						});
					}

					return exit.value;
				}),

			setValue: builder.setValue
				.use(authed)
				.handler(async ({ input, context, errors }) => {
					const exit = await Effect.runPromiseExit(
						services.setValue(input.key, input.value, context.owner),
					);

					if (Exit.isFailure(exit)) {
						const squashed = Cause.squash(exit.cause);
						if (squashed instanceof ORPCError) {
							if (squashed.code === "FORBIDDEN") {
								throw errors.FORBIDDEN({
									message: "Access denied",
									data: { action: "write" },
								});
							}
							throw squashed;
						}
						throw new ORPCError("INTERNAL_SERVER_ERROR", {
							message:
								squashed instanceof Error ? squashed.message : String(squashed),
							data: {
								originalError:
									squashed instanceof Error
										? squashed.message
										: String(squashed),
							},
						});
					}

					return exit.value;
				}),

			deleteKey: builder.deleteKey
				.use(authed)
				.handler(async ({ input, context, errors }) => {
					const exit = await Effect.runPromiseExit(
						services.deleteKey(input.key, context.owner),
					);

					if (Exit.isFailure(exit)) {
						const squashed = Cause.squash(exit.cause);
						if (squashed instanceof ORPCError) {
							if (squashed.code === "NOT_FOUND") {
								throw errors.NOT_FOUND({
									message: "Key not found",
									data: { resource: "kv", resourceId: input.key },
								});
							}
							if (squashed.code === "FORBIDDEN") {
								throw errors.FORBIDDEN({
									message: "Access denied",
									data: { action: "delete" },
								});
							}
							throw squashed;
						}
						throw new ORPCError("INTERNAL_SERVER_ERROR", {
							message:
								squashed instanceof Error ? squashed.message : String(squashed),
							data: {
								originalError:
									squashed instanceof Error
										? squashed.message
										: String(squashed),
							},
						});
					}

					return exit.value;
				}),

			publicError: builder.publicError.handler(() => {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Test UNAUTHORIZED error - thrown directly from handler",
					data: {
						provider: "test-provider",
						action: "test-action",
						timestamp: new Date().toISOString(),
					},
				});
			}),

			protectedError: builder.protectedError.use(authed).handler(() => {
				throw new ORPCError("NOT_FOUND", {
					message: "Test NOT_FOUND error - thrown after auth middleware",
					data: {
						resource: "test-resource",
						resourceId: "test-id-123",
						timestamp: new Date().toISOString(),
					},
				});
			}),
		};
	},
});

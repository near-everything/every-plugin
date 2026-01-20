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
        config.secrets.API_DATABASE_AUTH_TOKEN
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
            services.listKeys(context.owner, input.limit, input.offset)
          );

          if (Exit.isFailure(exit)) {
            throw Cause.squash(exit.cause);
          }

          return exit.value;
        }),

      getValue: builder.getValue
        .use(authed)
        .handler(async ({ input, context, errors }) => {
          const exit = await Effect.runPromiseExit(
            services.getValue(input.key, context.owner)
          );

          if (Exit.isFailure(exit)) {
            const error = Cause.squash(exit.cause);
            if (error instanceof ORPCError) {
              if (error.code === "NOT_FOUND") {
                throw errors.NOT_FOUND({
                  message: "Key not found",
                  data: { resource: "kv", resourceId: input.key },
                });
              }
              if (error.code === "FORBIDDEN") {
                throw errors.FORBIDDEN({
                  message: "Access denied",
                  data: { action: "read" },
                });
              }
            }
            throw error;
          }

          return exit.value;
        }),

      setValue: builder.setValue
        .use(authed)
        .handler(async ({ input, context, errors }) => {
          const exit = await Effect.runPromiseExit(
            services.setValue(input.key, input.value, context.owner)
          );

          if (Exit.isFailure(exit)) {
            const error = Cause.squash(exit.cause);
            if (error instanceof ORPCError && error.code === "FORBIDDEN") {
              throw errors.FORBIDDEN({
                message: "Access denied",
                data: { action: "write" },
              });
            }
            throw error;
          }

          return exit.value;
        }),

      deleteKey: builder.deleteKey
        .use(authed)
        .handler(async ({ input, context, errors }) => {
          const exit = await Effect.runPromiseExit(
            services.deleteKey(input.key, context.owner)
          );

          if (Exit.isFailure(exit)) {
            const error = Cause.squash(exit.cause);
            if (error instanceof ORPCError) {
              if (error.code === "NOT_FOUND") {
                throw errors.NOT_FOUND({
                  message: "Key not found",
                  data: { resource: "kv", resourceId: input.key },
                });
              }
              if (error.code === "FORBIDDEN") {
                throw errors.FORBIDDEN({
                  message: "Access denied",
                  data: { action: "delete" },
                });
              }
            }
            throw error;
          }

          return exit.value;
        }),
    };
  },
});

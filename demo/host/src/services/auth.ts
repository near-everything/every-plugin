import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { siwn } from "better-near-auth";
import { Context, Effect, Layer } from "effect";
import * as schema from "../db/schema/auth";
import { ConfigService } from "./config";
import { DatabaseService } from "./database";

export type Auth = ReturnType<typeof betterAuth>;

export const createAuth = Effect.gen(function* () {
  const config = yield* ConfigService;
  const db = yield* DatabaseService;

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: schema,
    }),
    trustedOrigins: process.env.CORS_ORIGIN?.split(",") || ["*"],
    secret: process.env.BETTER_AUTH_SECRET || "default-secret-change-in-production",
    baseURL: process.env.BETTER_AUTH_URL,
    plugins: [
      siwn({
        recipient: config.account,
      }),
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
      }),
    ],
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["siwn"],
        allowDifferentEmails: true,
        updateUserInfoOnLink: true,
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    advanced: {
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
      },
    },
  });
});

export class AuthService extends Context.Tag("host/AuthService")<AuthService, Auth>() {
  static Default = Layer.effect(AuthService, createAuth).pipe(
    Layer.provide(ConfigService.Default),
    Layer.provide(DatabaseService.Default)
  );
}

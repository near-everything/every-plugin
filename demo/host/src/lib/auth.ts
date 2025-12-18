
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { siwn } from "better-near-auth";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db";
import * as schema from "../db/schema/auth";

const configPath = process.env.BOS_CONFIG_PATH ?? path.resolve(process.cwd(), 'bos.config.json');
const bosConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: schema,
  }),
  trustedOrigins: process.env.CORS_ORIGIN?.split(",") || ["*"],
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  plugins: [
    siwn({
      recipient: bosConfig.account
    }),
  ],
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["siwn"],
      allowDifferentEmails: true,
      updateUserInfoOnLink: true
    }
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60 // 5 minutes cache - reduces DB hits
    }
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: true,
      httpOnly: true
    }
  }
});

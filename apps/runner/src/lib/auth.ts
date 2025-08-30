import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, anonymous, jwt } from "better-auth/plugins";
// import { siwn } from "better-near-auth";
// import { generateNonce } from "near-sign-verify";
import { db, schema } from "../db";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: schema,
	}),
	baseURL: process.env.BETTER_AUTH_URL,
	secret: process.env.BETTER_AUTH_SECRET,
	plugins: [
		anonymous(),
		// siwn({
		//   recipient: "run.everything.near",
		//   getNonce: async () => {
		//     return generateNonce();
		//   },
		// }),
		admin({
			defaultRole: "user",
			adminRoles: ["admin"],
			adminUserIds: process.env.ADMIN_USER_IDS?.split(",") || [],
		}),
		jwt({
			jwt: {
				definePayload: ({ user }) => ({
					id: user.id,
					isAnonymous: user.isAnonymous || false,
					role: user.role || "user",
					banned: user.banned || false,
				}),
				expirationTime: "1h",
			},
		}),
	],
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60, // 5 minutes cache - reduces DB hits
		},
	},
	defaultCookieAttributes: {
		sameSite: "none",
		secure: true,
		httpOnly: true,
	},
});

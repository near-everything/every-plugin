import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./schemas/database.ts",
	out: "./drizzle",
	dialect: "turso",
	dbCredentials: {
		url: process.env.TURSO_CONNECTION_URL!,
		authToken: process.env.TURSO_AUTH_TOKEN!,
	},
	verbose: true,
	strict: true,
});

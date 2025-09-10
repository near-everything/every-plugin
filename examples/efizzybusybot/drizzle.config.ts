import type { Config } from "drizzle-kit/index.d.mts";

export default {
	schema: "./schemas/database.ts",
	out: "./drizzle",
	dialect: "sqlite",
	dbCredentials: {
		url: "file:./database.db",
	},
	verbose: true,
	strict: true,
} satisfies Config;

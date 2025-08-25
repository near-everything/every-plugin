import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

const client = createClient({
	url: process.env.DATABASE_URL || "",
});

export const db = drizzle({ client });

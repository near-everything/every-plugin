import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db";

async function main() {
	console.log("Seeding dev database... ", process.env.DATABASE_URL);

	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL environment variable is required");
	}

	const pool = new Pool({
		connectionString: process.env.DATABASE_URL,
	});

	const db = drizzle(pool, { schema });

	try {
		console.log("Inserting data...");

		// await db.insert(schema.feeds).values([...]).onConflictDoNothing();
		// await db.insert(schema.users).values([...]).onConflictDoUpdate(...);

		console.log("Database seeded successfully!");
	} catch (error) {
		console.error("Failed to seed database:", error);
		throw error;
	} finally {
		await pool.end();
	}
}

main()
	.then(() => {
		console.log("Seeding complete.");
		process.exit(0);
	})
	.catch((err) => {
		console.error("An error occurred while seeding:", err);
		process.exit(1);
	});

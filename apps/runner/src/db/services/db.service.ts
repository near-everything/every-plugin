import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Context, Effect, Layer, Redacted } from "effect";
import { Pool } from "pg";
import { AppConfig } from "../../config";
import { schema } from "../schema";

export interface DatabaseClient {
	readonly db: NodePgDatabase<typeof schema>;
}

export const DatabaseClient = Context.GenericTag<DatabaseClient>("Database");

export const DatabaseLive = Layer.scoped(
	DatabaseClient,
	Effect.gen(function* () {
		const config = yield* AppConfig;

		const pool = yield* Effect.acquireRelease(
			Effect.sync(() => {
				console.log("Database pool created.");
				return new Pool({
					connectionString: Redacted.value(config.databaseUrl),
				});
			}),
			(pool) =>
				Effect.promise(() => {
					console.log("Database pool closing...");
					return pool.end();
				}).pipe(
					Effect.catchAllDefect((error) =>
						Effect.logError(`Error closing database pool: ${error}`),
					),
				),
		);

		const db = drizzle(pool, { schema, casing: "snake_case" });

		// Run migrations
		yield* Effect.tryPromise({
			try: () => {
				console.log("Migrating database...");
				return migrate(db, {
					migrationsFolder: `${process.cwd()}/migrations`,
				});
			},
			catch: (error) => new Error(`Database migration failed: ${error}`),
		});

		return { db };
	}),
);

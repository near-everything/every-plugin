import { type Client, createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate as drizzleMigrate } from "drizzle-orm/libsql/migrator";
import { Context, Effect, Layer } from "every-plugin/effect";
import { migrate } from "../db/migrator";
import * as authSchema from "../db/schema/auth";
import { DatabaseError } from "./errors";

type Schema = typeof authSchema;

export type Database = LibSQLDatabase<Schema>;

interface DatabaseWithClient {
  db: Database;
  client: Client;
}

const acquireDatabase = Effect.tryPromise({
  try: async (): Promise<DatabaseWithClient> => {
    const client = createClient({
      url: process.env.HOST_DATABASE_URL || "file:./database.db",
      authToken: process.env.HOST_DATABASE_AUTH_TOKEN,
    });

    const db = drizzle(client, {
      schema: {
        ...authSchema,
      },
    });

    const isRemote = process.env.HOST_SOURCE === "remote";
    console.log("[Database] Migration mode:", isRemote ? "bundled" : "file-based");

    if (isRemote) {
      console.log("[Database] Loading bundled migrations...");
      const migrations = await import("virtual:drizzle-migrations.sql");
      console.log("[Database] Migrations loaded:", migrations.default?.length ?? 0, "migrations");
      await migrate(client, migrations.default);
      console.log("[Database] Migrations applied successfully");
    } else {
      console.log("[Database] Using file-based migrations");
      await drizzleMigrate(db, { migrationsFolder: "./migrations" });
    }

    return { db, client };
  },
  catch: (e) => new DatabaseError({ cause: e }),
});

const releaseDatabase = ({ client }: DatabaseWithClient) =>
  Effect.sync(() => {
    try {
      client.close();
      console.log("[Database] Connection closed");
    } catch {
    }
  });

export class DatabaseService extends Context.Tag("host/DatabaseService")<
  DatabaseService,
  Database
>() {
  static Default = Layer.scoped(
    DatabaseService,
    Effect.acquireRelease(acquireDatabase, releaseDatabase).pipe(
      Effect.map(({ db }) => db)
    )
  );
}

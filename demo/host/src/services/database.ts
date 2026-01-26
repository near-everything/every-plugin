import { type Client, createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate as drizzleMigrate } from "drizzle-orm/libsql/migrator";
import { Effect } from "every-plugin/effect";
import { migrate } from "../db/migrator";
import * as authSchema from "../db/schema/auth";
import { DatabaseError } from "./errors";

type Schema = typeof authSchema;

export interface DatabaseClient {
  db: LibSQLDatabase<Schema>;
  client: Client;
}

let activeClient: Client | null = null;

const acquireDatabase = Effect.tryPromise({
  try: async (): Promise<LibSQLDatabase<Schema>> => {
    const client = createClient({
      url: process.env.HOST_DATABASE_URL || "file:./database.db",
      authToken: process.env.HOST_DATABASE_AUTH_TOKEN,
    });

    activeClient = client;

    const db = drizzle(client, {
      schema: {
        ...authSchema,
      },
    });

    const isRemote = process.env.HOST_SOURCE === "remote";
    console.log("[Database] Migration mode:", isRemote ? "bundled" : "file-based");
    console.log("[Database] HOST_SOURCE:", process.env.HOST_SOURCE);

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

    return db;
  },
  catch: (e) => new DatabaseError({ cause: e }),
});

export const closeDatabase = (): void => {
  if (activeClient) {
    try {
      activeClient.close();
      console.log("[Database] Connection closed");
    } catch {
    }
    activeClient = null;
  }
};

export const createDatabase = acquireDatabase;

export type Database = LibSQLDatabase<Schema>;

export class DatabaseService extends Effect.Service<DatabaseService>()("host/DatabaseService", {
  effect: createDatabase,
}) {}

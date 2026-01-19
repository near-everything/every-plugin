import { type Client, createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { Effect } from "every-plugin/effect";
import * as authSchema from "../db/schema/auth";
import { DatabaseError } from "./errors";

type Schema = typeof authSchema;

export interface DatabaseClient {
  db: LibSQLDatabase<Schema>;
  client: Client;
}

let activeClient: Client | null = null;

const acquireDatabase = Effect.try({
  try: (): LibSQLDatabase<Schema> => {
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

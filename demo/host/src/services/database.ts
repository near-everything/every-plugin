import { createClient } from "@libsql/client";
import { Effect } from "effect";
import { drizzle } from "drizzle-orm/libsql";
import * as authSchema from "../db/schema/auth";
import { DatabaseError } from "./errors";

export const createDatabase = Effect.try({
  try: () => {
    const client = createClient({
      url: process.env.HOST_DATABASE_URL || "file:./database.db",
      authToken: process.env.HOST_DATABASE_AUTH_TOKEN,
    });

    return drizzle(client, {
      schema: {
        ...authSchema,
      },
    });
  },
  catch: (e) => new DatabaseError({ cause: e }),
});

export type Database = Effect.Effect.Success<typeof createDatabase>;

export class DatabaseService extends Effect.Service<DatabaseService>()("host/DatabaseService", {
  effect: createDatabase,
}) {}

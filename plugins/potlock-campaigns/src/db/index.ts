import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

export const createDatabase = (url: string, authToken?: string) => {
  const client = createClient({
    url,
    authToken,
  });

  return drizzle({ client, schema });
};

export type Database = ReturnType<typeof createDatabase>;

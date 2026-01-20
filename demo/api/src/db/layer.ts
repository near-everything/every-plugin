import { Context, Effect, Layer } from "every-plugin/effect";
import { createDatabase, type Database } from "./index";

export class DatabaseTag extends Context.Tag("Database")<
  DatabaseTag,
  Database
>() {}

export const DatabaseLive = (url: string, authToken?: string) =>
  Layer.effect(
    DatabaseTag,
    Effect.sync(() => createDatabase(url, authToken))
  );

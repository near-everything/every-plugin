import { Context, Layer } from "every-plugin/effect";
import type { Database as DrizzleDatabase } from "../db";

export class Database extends Context.Tag("Database")<Database, DrizzleDatabase>() {}

export const DatabaseLive = (url: string, authToken?: string) =>
  Layer.sync(Database, () => {
    const { createDatabase } = require("../db");
    return createDatabase(url, authToken);
  });

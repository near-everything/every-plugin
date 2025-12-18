import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// just an example
export const kvStore = sqliteTable("key_value_store", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  nearAccountId: text("near_account_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

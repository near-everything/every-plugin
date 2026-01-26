import type { Client } from "@libsql/client";

export interface Migration {
  idx: number;
  when: number;
  tag: string;
  hash: string;
  sql: string[];
}

export async function migrate(client: Client, migrations: Migration[]): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  const applied = await client.execute(`SELECT hash FROM __drizzle_migrations`);
  const appliedHashes = new Set(applied.rows.map(r => r.hash as string));

  for (const migration of migrations) {
    if (appliedHashes.has(migration.hash)) continue;

    console.log(`[Database] Applying migration: ${migration.tag}`);

    await client.batch([
      ...migration.sql.map(sql => ({ sql })),
      {
        sql: `INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`,
        args: [migration.hash, Date.now()]
      }
    ]);
  }
}

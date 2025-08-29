import * as dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as path from "path";
import { Client } from "pg";
import { workflow } from "../src/db/schema";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

interface Replacement {
  oldValue: string;
  newValue: string;
}

// Define your list of transformations
const replacements: Replacement[] = [{ oldValue: "curator.notes", newValue: "curatorNotes" }];

async function performUpOperation(db: NodePgDatabase) {
  for (const { oldValue, newValue } of replacements) {
    console.log(`Applying replacement: "${oldValue}" -> "${newValue}"`);
    await db.execute(sql`
        UPDATE ${workflow}
        SET
            config = REPLACE(config::text, ${oldValue}, ${newValue})::jsonb
        WHERE
            config::text LIKE ${`%${oldValue}%`};
      `);
  }
  console.log("All JSONB string replacements applied.");
}

async function performDownOperation(db: NodePgDatabase) {
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { oldValue, newValue } = replacements[i] as Replacement;
    console.log(`Reverting replacement: "${newValue}" -> "${oldValue}"`);
    await db.execute(sql`
        UPDATE ${workflow}
        SET
            config = REPLACE(config::text, ${newValue}, ${oldValue})::jsonb
        WHERE
            config::text LIKE ${`%${newValue}%`};
      `);
  }
  console.log("All JSONB string replacements reverted.");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Error: DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  const operation = process.argv[2];
  if (operation !== "up" && operation !== "down") {
    console.error(
      "Error: Please specify 'up' or 'down' as a command line argument.",
    );
    console.log(
      "Usage: bun run packages/shared-db/scripts/overwrite-vars.ts <up|down>",
    );
    process.exit(1);
  }

  const dbClient = new Client({ connectionString: databaseUrl });

  try {
    console.log(`Connecting to remote database specified by DATABASE_URL...`);
    await dbClient.connect();
    const dbInstance = drizzle(dbClient);

    if (operation === "up") {
      console.log("Running UP operation...");
      await performUpOperation(dbInstance);
    } else {
      // operation === 'down'
      console.log("Running DOWN operation...");
      await performDownOperation(dbInstance);
    }
    console.log(`Operation '${operation}' completed successfully.`);
  } catch (error) {
    console.error(`Error during '${operation}' operation:`, error);
    process.exit(1);
  } finally {
    if (dbClient) {
      console.log("Closing database connection.");
      await dbClient.end();
    }
  }
}

main();

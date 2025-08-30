export { DbError, ValidationError } from "./errors";
export type { DB } from "./schema";
export { schema } from "./schema";
export {
	DatabaseClient,
	DatabaseLive,
	WorkflowService,
	WorkflowServiceLive,
} from "./services";
export {
	PluginRunNotFoundError,
	WorkflowNotFoundError,
} from "./services/workflow.service";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { DB } from "./schema";
import { schema } from "./schema";

if (!process.env.DATABASE_URL) {
	throw new Error("DATABASE_URL environment variable is required");
}

const pool = new Pool({
	connectionString: process.env.DATABASE_URL!,
});
const db: NodePgDatabase<DB> = drizzle({
	client: pool,
	schema,
	casing: "snake_case",
});

export { db, pool };

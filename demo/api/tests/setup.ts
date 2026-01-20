import { migrate } from 'drizzle-orm/libsql/migrator';
import Plugin from '@/index';
import { createDatabase, type Database } from '@/db';
import pluginDevConfig from '../plugin.dev';
import { createPluginRuntime } from 'every-plugin';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const TEST_DB_URL = 'file:./api-test.db';

const TEST_CONFIG = {
  variables: pluginDevConfig.config.variables,
  secrets: {
    API_DATABASE_URL: TEST_DB_URL,
    API_DATABASE_AUTH_TOKEN: undefined,
  },
};

let _runtime: ReturnType<typeof createPluginRuntime> | null = null;
let _testDb: Database | null = null;

export function getRuntime() {
  if (!_runtime) {
    _runtime = createPluginRuntime({
      registry: {
        [pluginDevConfig.pluginId]: {
          module: Plugin,
        },
      },
      secrets: {},
    });
  }
  return _runtime;
}

export function getTestDb() {
  if (!_testDb) {
    _testDb = createDatabase(TEST_DB_URL);
  }
  return _testDb;
}

export async function runMigrations() {
  const db = getTestDb();
  await migrate(db, {
    migrationsFolder: join(__dirname, '../src/db/migrations'),
  });
}

export async function getPluginClient(context?: { nearAccountId?: string }) {
  const runtime = getRuntime();
  const { createClient } = await runtime.usePlugin(
    pluginDevConfig.pluginId,
    TEST_CONFIG
  );
  return createClient(context);
}

export async function teardown() {
  if (_runtime) {
    await _runtime.shutdown();
    _runtime = null;
  }
  _testDb = null;
}

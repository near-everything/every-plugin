import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'turso',
  dbCredentials: {
    url: process.env.API_DATABASE_URL || 'file:./database.db',
    authToken: process.env.API_DATABASE_AUTH_TOKEN,
  },
  verbose: true,
  strict: true,
});

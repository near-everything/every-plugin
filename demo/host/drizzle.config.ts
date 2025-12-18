import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema',
  out: './migrations',
  dialect: 'turso',
  dbCredentials: {
    url: process.env.HOST_DATABASE_URL || 'file:./database.db',
    authToken: process.env.HOST_DATABASE_AUTH_TOKEN,
  },
  verbose: true,
  strict: true,
});

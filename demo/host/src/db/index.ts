import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as authSchema from './schema/auth';

const client = createClient({
  url: process.env.AUTH_DATABASE_URL || 'file:./database.db',
  authToken: process.env.AUTH_DATABASE_AUTH_TOKEN,
});

export const db = drizzle(client, {
  schema: {
    ...authSchema,
  },
});

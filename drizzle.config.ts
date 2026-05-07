import type { Config } from 'drizzle-kit';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_NON_POOLING!,
  },
  verbose: true,
  strict: true,
} satisfies Config;

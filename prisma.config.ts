import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'packages/db/prisma/schema.prisma',
  migrations: {
    path: 'packages/db/prisma/migrations',
    seed: 'ts-node --transpile-only packages/db/prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});

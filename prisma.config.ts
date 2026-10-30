import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'libs/api/database/prisma/schema.prisma',
  migrations: {
    path: 'libs/api/database/prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});

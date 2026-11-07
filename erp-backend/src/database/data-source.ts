import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { postgresOptions } from './database.module.js';

// Used only by the TypeORM CLI (npm run migration:*), from the compiled
// dist/ folder. The running app builds its connection in database.module.ts.
if (existsSync('.env')) process.loadEnvFile('.env');

export default new DataSource({
  ...postgresOptions(new ConfigService()),
  // migration:generate compares these entities with the database.
  entities: [join(import.meta.dirname, '..', '**', '*.entity.js')],
});

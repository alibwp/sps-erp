import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from '../common/database/snake-naming.strategy.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { migrations } from './migrations/index.js';
import { TypeOrmLogger } from './typeorm-logger.js';

// TypeORM's synchronize can alter tables, so it is only ever allowed on the
// Docker Compose database or one running on this machine, never a live one.
const LOCAL_DATABASE_HOSTS = ['db', 'localhost', '127.0.0.1', '[::1]'];

type PostgresOptions = Extract<DataSourceOptions, { type: 'postgres' }>;

// Options shared by the app and the migration CLI (data-source.ts).
export function postgresOptions(config: ConfigService): PostgresOptions {
  // One connection string for every environment: the local Docker database
  // in development, the managed database in production.
  const url = config.getOrThrow<string>('DATABASE_URL');
  const isLocal = LOCAL_DATABASE_HOSTS.includes(new URL(url).hostname);
  const synchronize = config.get('DB_SYNCHRONIZE') === 'true';
  if (synchronize && !isLocal) {
    Logger.warn(
      'DB_SYNCHRONIZE=true ignored: the database is not local',
      'DatabaseModule',
    );
  }

  return {
    type: 'postgres',
    url,
    // Managed databases (AWS RDS, Neon, Supabase, ...) require SSL.
    ssl:
      config.get('DB_SSL') === 'true'
        ? {
            rejectUnauthorized:
              config.get('DB_SSL_REJECT_UNAUTHORIZED') !== 'false',
          }
        : false,
    synchronize: synchronize && isLocal,
    // Schema changes come only from migrations, listed in migrations/index.ts.
    migrations,
    migrationsTableName: 'migrations',
    namingStrategy: new SnakeNamingStrategy(),
    // UUID ids use gen_random_uuid(), built into PostgreSQL 13 and later,
    // so no extension has to be installed.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    logger: new TypeOrmLogger(),
  };
}

export function databaseOptions(config: ConfigService): TypeOrmModuleOptions {
  return {
    ...postgresOptions(config),
    autoLoadEntities: true,
    // Pending migrations are applied when the backend starts.
    migrationsRun: true,
  };
}

// Global: every area runs its writes through TransactionService.
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: databaseOptions,
    }),
  ],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class DatabaseModule {}

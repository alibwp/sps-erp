import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import pg from 'pg';
import { DataSource } from 'typeorm';
import { postgresOptions } from '../../src/database/database.module.js';
import { redisOptions } from '../../src/redis/redis.module.js';

function databaseName(): string {
  const name = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
  // Second guard, in case this is called without applyTestEnvironment().
  if (!name.endsWith('_test'))
    throw new Error(`Refusing to modify "${name}": not a _test database`);
  return name;
}

export async function createTestDatabaseIfMissing(): Promise<void> {
  const name = databaseName();
  const maintenance = new URL(process.env.DATABASE_URL ?? '');
  maintenance.pathname = '/postgres';
  const client = new pg.Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    const found = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );
    if (!found.rowCount) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}

export function testDataSource(): DataSource {
  databaseName();
  return new DataSource({
    ...postgresOptions(new ConfigService()),
    logger: undefined,
    logging: false,
  });
}

// Drops everything and applies every migration from scratch, which also
// proves the migrations run on an empty database.
export async function rebuildSchema(): Promise<void> {
  const dataSource = await testDataSource().initialize();
  try {
    await dataSource.query('DROP SCHEMA public CASCADE');
    await dataSource.query('CREATE SCHEMA public');
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}

// Empties every table except the migration history.
export async function truncateAllTables(): Promise<void> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  databaseName();
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'",
    );
    if (rows.length) {
      const tables = rows
        .map((row) => `"public"."${row.tablename}"`)
        .join(', ');
      await client.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
}

export function testRedis(): Redis {
  return new Redis({
    ...redisOptions(new ConfigService()),
    maxRetriesPerRequest: 1,
  });
}

export async function flushTestRedis(): Promise<void> {
  const redis = testRedis();
  try {
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
}

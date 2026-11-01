import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';

// TypeORM's synchronize can alter tables, so it is only ever allowed on the
// Docker Compose database or one running on this machine, never a live one.
const LOCAL_DATABASE_HOSTS = ['db', 'localhost', '127.0.0.1', '[::1]'];

export function databaseOptions(config: ConfigService): TypeOrmModuleOptions {
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
    autoLoadEntities: true,
    synchronize: synchronize && isLocal,
  };
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: databaseOptions,
    }),
  ],
})
export class DatabaseModule {}

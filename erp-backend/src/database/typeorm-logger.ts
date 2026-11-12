import { Logger as NestLogger } from '@nestjs/common';
import type { Logger as TypeOrmLoggerInterface } from 'typeorm';

// Sends TypeORM's warnings, errors and migration progress through the app
// logger, so they come out as JSON with the rest. Queries are not logged:
// their parameters can hold personal data.
export class TypeOrmLogger implements TypeOrmLoggerInterface {
  private readonly logger = new NestLogger('TypeORM');

  logQuery(): void {}

  logQueryError(error: string | Error, query: string): void {
    const message = error instanceof Error ? error.message : error;
    this.logger.error(`${message} -- ${query}`);
  }

  logQuerySlow(time: number, query: string): void {
    this.logger.warn(`Slow query (${time} ms): ${query}`);
  }

  logSchemaBuild(message: string): void {
    this.logger.log(message);
  }

  logMigration(message: string): void {
    this.logger.log(message);
  }

  log(level: 'log' | 'info' | 'warn', message: unknown): void {
    if (level === 'warn') this.logger.warn(String(message));
    else this.logger.log(String(message));
  }
}

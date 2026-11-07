import { Injectable, Logger } from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  FindOptionsWhere,
  ObjectLiteral,
} from 'typeorm';
import { PG_RETRYABLE_CODES, postgresCode } from '../errors/error-response.js';

// The PostgreSQL levels TypeORM accepts for dataSource.transaction().
export type IsolationLevel =
  'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

export interface Transaction {
  manager: EntityManager;
  // Loads one row and holds it with SELECT ... FOR UPDATE until commit, so
  // a concurrent request deciding on the same row waits for this one.
  lockOne<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    where: FindOptionsWhere<T>,
  ): Promise<T | null>;
  // Runs after a successful commit (queue an email, a notice, a report).
  // A failure here is logged and never undoes the committed data.
  afterCommit(callback: () => unknown): void;
}

export interface TransactionOptions {
  isolation?: IsolationLevel;
}

// How many times a whole transaction is tried when PostgreSQL reports a
// deadlock or a serialization failure.
const MAX_ATTEMPTS = 2;

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(private readonly dataSource: DataSource) {}

  async run<T>(
    work: (tx: Transaction) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const callbacks: Array<() => unknown> = [];
      let result: T;
      try {
        result = await this.transaction(options, (manager) =>
          work({
            manager,
            lockOne: (entity, where) =>
              manager.findOne(entity, {
                where,
                lock: { mode: 'pessimistic_write' },
              }),
            afterCommit: (callback) => callbacks.push(callback),
          }),
        );
      } catch (error) {
        const code = postgresCode(error);
        if (
          attempt < MAX_ATTEMPTS &&
          code &&
          PG_RETRYABLE_CODES.includes(code)
        ) {
          this.logger.warn(
            `Retrying transaction after PostgreSQL error ${code}`,
          );
          continue;
        }
        throw error;
      }

      await this.runAfterCommit(callbacks);
      return result;
    }
  }

  private transaction<T>(
    options: TransactionOptions,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return options.isolation
      ? this.dataSource.transaction(options.isolation, work)
      : this.dataSource.transaction(work);
  }

  private async runAfterCommit(callbacks: Array<() => unknown>): Promise<void> {
    for (const callback of callbacks) {
      try {
        await callback();
      } catch (error) {
        this.logger.error(
          `After-commit step failed: ${error instanceof Error ? error.stack : String(error)}`,
        );
      }
    }
  }
}

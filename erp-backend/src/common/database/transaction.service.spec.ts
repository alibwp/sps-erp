import { QueryFailedError } from 'typeorm';
import { TransactionService } from './transaction.service.js';

const pgError = (code: string) =>
  new QueryFailedError(
    'UPDATE ...',
    [],
    Object.assign(new Error('pg'), { code }),
  );

function fakeDataSource(outcomes: Array<Error | null>) {
  const manager = { findOne: vi.fn().mockResolvedValue({ id: 'row' }) };
  const transaction = vi.fn(async (...args: unknown[]) => {
    const work = args[args.length - 1] as (m: unknown) => Promise<unknown>;
    const result = await work(manager);
    const outcome = outcomes.shift();
    if (outcome) throw outcome; // the commit fails
    return result;
  });
  return { dataSource: { transaction } as never, transaction, manager };
}

describe('TransactionService', () => {
  it('returns the result and runs after-commit steps once committed', async () => {
    const { dataSource } = fakeDataSource([null]);
    const order: string[] = [];

    const result = await new TransactionService(dataSource).run(async (tx) => {
      tx.afterCommit(() => order.push('email queued'));
      order.push('work');
      return 42;
    });

    expect(result).toBe(42);
    expect(order).toEqual(['work', 'email queued']);
  });

  it.each(['40P01', '40001'])('retries once on PostgreSQL %s', async (code) => {
    const { dataSource, transaction } = fakeDataSource([pgError(code), null]);
    const steps: number[] = [];

    await new TransactionService(dataSource).run(async (tx) => {
      tx.afterCommit(() => steps.push(transaction.mock.calls.length));
    });

    expect(transaction).toHaveBeenCalledTimes(2);
    // Only the attempt that committed runs its after-commit step.
    expect(steps).toEqual([2]);
  });

  it('gives up after the second deadlock', async () => {
    const { dataSource, transaction } = fakeDataSource([
      pgError('40P01'),
      pgError('40P01'),
    ]);
    await expect(
      new TransactionService(dataSource).run(async () => 1),
    ).rejects.toBeInstanceOf(QueryFailedError);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('does not retry other errors and skips after-commit steps', async () => {
    const { dataSource, transaction } = fakeDataSource([pgError('23505')]);
    const afterCommit = vi.fn();

    await expect(
      new TransactionService(dataSource).run(async (tx) => {
        tx.afterCommit(afterCommit);
      }),
    ).rejects.toBeInstanceOf(QueryFailedError);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(afterCommit).not.toHaveBeenCalled();
  });

  it('a failing after-commit step does not fail the committed work', async () => {
    const { dataSource } = fakeDataSource([null]);
    const second = vi.fn();

    await expect(
      new TransactionService(dataSource).run(async (tx) => {
        tx.afterCommit(() => {
          throw new Error('Redis is down');
        });
        tx.afterCommit(second);
        return 'saved';
      }),
    ).resolves.toBe('saved');
    expect(second).toHaveBeenCalled();
  });

  it('lockOne reads with a pessimistic write lock', async () => {
    const { dataSource, manager } = fakeDataSource([null]);
    class Seat {}

    await new TransactionService(dataSource).run((tx) =>
      tx.lockOne(Seat, { id: 'row' } as never),
    );

    expect(manager.findOne).toHaveBeenCalledWith(Seat, {
      where: { id: 'row' },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('passes the isolation level through', async () => {
    const { dataSource, transaction } = fakeDataSource([null]);
    await new TransactionService(dataSource).run(async () => 1, {
      isolation: 'SERIALIZABLE',
    });
    expect(transaction.mock.calls[0][0]).toBe('SERIALIZABLE');
  });
});

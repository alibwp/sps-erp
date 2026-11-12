import { Column, DataSource, Entity } from 'typeorm';
import { AppBaseEntity } from '../src/common/database/base-entity.js';
import { TransactionService } from '../src/common/database/transaction.service.js';
import { dropAppendOnly, makeAppendOnly } from '../src/database/append-only.js';
import { migrations } from '../src/database/migrations/index.js';
import { defineFactory } from './support/factory.js';
import { testDataSource } from './support/test-database.js';

// A table that exists only in this test, to exercise the base entity, the
// naming strategy, the factory and row locks against real PostgreSQL.
@Entity({ name: 'e2e_probe_records' })
class ProbeRecord extends AppBaseEntity {
  @Column()
  displayName: string;

  @Column({ type: 'int', default: 0 })
  seatsTaken: number;
}

const CREATE_PROBE_TABLE = `
  CREATE TABLE e2e_probe_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name varchar NOT NULL,
    seats_taken int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;

describe('Database foundation (e2e)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      ...testDataSource().options,
      entities: [ProbeRecord],
    } as never);
    await dataSource.initialize();
    await dataSource.query('DROP TABLE IF EXISTS e2e_probe_records');
    await dataSource.query(CREATE_PROBE_TABLE);
  });

  afterAll(async () => {
    await dataSource.query('DROP TABLE IF EXISTS e2e_probe_records');
    await dataSource.destroy();
  });

  describe('migrations', () => {
    const functionExists = async () =>
      (
        await dataSource.query(
          "SELECT 1 FROM pg_proc WHERE proname = 'refuse_append_only_change'",
        )
      ).length === 1;

    it('are all applied, and running them again changes nothing', async () => {
      const applied = await dataSource.query(
        'SELECT name FROM migrations ORDER BY id',
      );
      expect(applied.map((row: { name: string }) => row.name)).toEqual(
        migrations.map((m) => m.name),
      );

      expect(await dataSource.runMigrations()).toEqual([]);
      expect(
        await dataSource.query('SELECT count(*)::int AS n FROM migrations'),
      ).toEqual([{ n: migrations.length }]);
    });

    it('revert undoes the last migration, and running again restores it', async () => {
      // The tables and how many rows each holds, so a migration that only
      // seeds data shows its revert too.
      const state = async () => {
        const tables = (
          await dataSource.query(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('migrations', 'e2e_probe_records') ORDER BY tablename",
          )
        ).map((row: { tablename: string }) => row.tablename);
        const rows: Record<string, number> = {};
        for (const table of tables) {
          const [{ n }] = await dataSource.query(
            `SELECT count(*)::int AS n FROM "${table}"`,
          );
          rows[table] = n;
        }
        return rows;
      };
      const before = await state();

      await dataSource.undoLastMigration();
      expect(await dataSource.showMigrations()).toBe(true); // one pending
      expect(await state()).not.toEqual(before);

      await dataSource.runMigrations();
      expect(await dataSource.showMigrations()).toBe(false);
      expect(await state()).toEqual(before);
    });

    it('every migration reverts down to an empty schema and runs up again', async () => {
      for (let i = 0; i < migrations.length; i++) {
        await dataSource.undoLastMigration();
      }
      expect(
        await dataSource.query('SELECT count(*)::int AS n FROM migrations'),
      ).toEqual([{ n: 0 }]);
      expect(await functionExists()).toBe(false);
      expect(
        await dataSource.query("SELECT to_regclass('public.users') AS t"),
      ).toEqual([{ t: null }]);

      await dataSource.runMigrations();
      expect(await functionExists()).toBe(true);
      expect(await dataSource.showMigrations()).toBe(false);
    });
  });

  describe('append-only tables', () => {
    beforeAll(async () => {
      await dataSource.query(
        'CREATE TABLE e2e_history (id serial PRIMARY KEY, note text)',
      );
      await makeAppendOnly(dataSource.createQueryRunner(), 'e2e_history');
    });

    afterAll(async () => {
      await dropAppendOnly(dataSource.createQueryRunner(), 'e2e_history');
      await dataSource.query('DROP TABLE e2e_history');
    });

    it('accept inserts and refuse UPDATE and DELETE', async () => {
      await dataSource.query(
        "INSERT INTO e2e_history (note) VALUES ('opened')",
      );

      await expect(
        dataSource.query("UPDATE e2e_history SET note = 'changed'"),
      ).rejects.toThrow('e2e_history is append-only: UPDATE is not allowed');
      await expect(dataSource.query('DELETE FROM e2e_history')).rejects.toThrow(
        'e2e_history is append-only: DELETE is not allowed',
      );
      expect(await dataSource.query('SELECT note FROM e2e_history')).toEqual([
        { note: 'opened' },
      ]);
    });
  });

  describe('base entity, naming and factories', () => {
    const records = defineFactory(ProbeRecord, (n) => ({
      displayName: `Record ${n}`,
    }));

    it('gets a UUID from PostgreSQL, timestamptz times and snake_case columns', async () => {
      const record = await records.create(dataSource, { seatsTaken: 2 });

      expect(record.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(record.createdAt).toBeInstanceOf(Date);
      const [row] = await dataSource.query(
        'SELECT display_name, seats_taken FROM e2e_probe_records WHERE id = $1',
        [record.id],
      );
      expect(row).toEqual({ display_name: record.displayName, seats_taken: 2 });
    });

    it('numbers each built record, so unique values stay unique', async () => {
      const [a, b] = await records.createMany(dataSource, 2);
      expect(a.displayName).not.toBe(b.displayName);
    });
  });

  describe('TransactionService', () => {
    it('serialises two requests deciding on the same row', async () => {
      const seat = await dataSource
        .getRepository(ProbeRecord)
        .save({ displayName: 'Last seat', seatsTaken: 0 });
      const transactions = new TransactionService(dataSource);

      // Each request reads the count, waits, then writes count + 1. Without
      // the row lock both would read 0 and the result would be 1.
      const takeSeat = () =>
        transactions.run(async (tx) => {
          const row = await tx.lockOne(ProbeRecord, { id: seat.id });
          await new Promise((resolve) => setTimeout(resolve, 200));
          await tx.manager.update(ProbeRecord, seat.id, {
            seatsTaken: (row?.seatsTaken ?? 0) + 1,
          });
        });
      await Promise.all([takeSeat(), takeSeat()]);

      const after = await dataSource
        .getRepository(ProbeRecord)
        .findOneByOrFail({ id: seat.id });
      expect(after.seatsTaken).toBe(2);
    });

    it('runs after-commit steps only when the transaction commits', async () => {
      const transactions = new TransactionService(dataSource);
      const sent: string[] = [];

      await expect(
        transactions.run(async (tx) => {
          await tx.manager.save(ProbeRecord, { displayName: 'Rolled back' });
          tx.afterCommit(() => sent.push('rolled back'));
          throw new Error('rule refused');
        }),
      ).rejects.toThrow('rule refused');
      await transactions.run(async (tx) => {
        await tx.manager.save(ProbeRecord, { displayName: 'Committed' });
        tx.afterCommit(() => sent.push('committed'));
      });

      expect(sent).toEqual(['committed']);
      expect(
        await dataSource
          .getRepository(ProbeRecord)
          .countBy({ displayName: 'Rolled back' }),
      ).toBe(0);
    });
  });
});

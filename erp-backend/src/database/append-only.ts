import type { QueryRunner } from 'typeorm';

// Created by the AppendOnlyGuard migration.
export const APPEND_ONLY_FUNCTION = 'refuse_append_only_change';

function triggerName(table: string): string {
  return `${table}_append_only`;
}

// Makes a history table (status changes, audit log, ledger lines, ...)
// refuse UPDATE and DELETE. Call it from the migration that creates the
// table; corrections are recorded as new rows.
export async function makeAppendOnly(
  queryRunner: QueryRunner,
  table: string,
): Promise<void> {
  await queryRunner.query(
    `CREATE TRIGGER "${triggerName(table)}" BEFORE UPDATE OR DELETE ON "${table}" ` +
      `FOR EACH ROW EXECUTE FUNCTION ${APPEND_ONLY_FUNCTION}()`,
  );
}

export async function dropAppendOnly(
  queryRunner: QueryRunner,
  table: string,
): Promise<void> {
  await queryRunner.query(
    `DROP TRIGGER IF EXISTS "${triggerName(table)}" ON "${table}"`,
  );
}

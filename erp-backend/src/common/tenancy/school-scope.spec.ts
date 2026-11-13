import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';
import { SnakeNamingStrategy } from '../database/snake-naming.strategy.js';
import { runWithRequestContext } from '../request-context/request-context.js';
import {
  SchoolOwned,
  isNamingItsOwnSchool,
  isSchoolOwned,
  newInSchool,
  workingSchoolId,
} from './school-scope.js';

const SRC = join(import.meta.dirname, '..', '..');

function entityFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entityFiles(path);
    return entry.name.endsWith('.entity.ts') ? [path] : [];
  });
}

// Reference tests/Feature/SchoolScopeTest.php: campus ownership is enforced
// in one place, so every entity with a school_id column must be registered
// with the scoping helper.
describe('school scope', () => {
  it('every entity with a school_id column is marked @SchoolOwned() or @NamesItsOwnSchool()', async () => {
    const files = entityFiles(SRC);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) await import(file);

    const naming = new SnakeNamingStrategy();
    const storage = getMetadataArgsStorage();
    const entities = storage.tables
      .map((table) => table.target)
      .filter((target): target is Function => typeof target === 'function');

    const withSchool = entities.filter(
      (target) =>
        storage.columns.some(
          (column) =>
            column.target === target &&
            naming.columnName(column.propertyName, column.options.name, []) ===
              'school_id',
        ) ||
        storage.joinColumns.some(
          (column) => column.target === target && column.name === 'school_id',
        ),
    );
    expect(withSchool.length).toBeGreaterThanOrEqual(6);

    const unregistered = withSchool
      .filter(
        (target) => !isSchoolOwned(target) && !isNamingItsOwnSchool(target),
      )
      .map((target) => target.name);
    expect(
      unregistered,
      `Mark these entities @SchoolOwned() (or @NamesItsOwnSchool()): ${unregistered.join(', ')} — files under ${relative(process.cwd(), SRC)}`,
    ).toEqual([]);

    // A mark on an entity with no school_id is a mistake too.
    const misplaced = entities
      .filter((target) => isSchoolOwned(target) || isNamingItsOwnSchool(target))
      .filter((target) => !withSchool.includes(target))
      .map((target) => target.name);
    expect(misplaced).toEqual([]);
    // Importing every entity file takes a few seconds on a busy machine.
  }, 30_000);

  it('a new record takes the working campus; an unmarked entity is refused', () => {
    const manager = { create: vi.fn((_entity: unknown, data: object) => data) };
    @SchoolOwned()
    class Owned {}
    class Unmarked {}
    const schoolId = '22222222-2222-4222-8222-222222222222';

    runWithRequestContext({ ipAddress: null, userId: null, schoolId }, () => {
      expect(
        newInSchool(manager as never, Owned, { name: 'x' } as never),
      ).toEqual({
        name: 'x',
        schoolId,
      });
      expect(() => newInSchool(manager as never, Unmarked, {})).toThrow(
        /not marked @SchoolOwned/,
      );
    });
    // Outside a campus route there is no working campus.
    expect(() => newInSchool(manager as never, Owned, {})).toThrow(
      /no working campus/,
    );
  });

  it('reads the working campus from the request context', () => {
    const schoolId = '11111111-1111-4111-8111-111111111111';
    runWithRequestContext({ ipAddress: null, userId: null, schoolId }, () => {
      expect(workingSchoolId()).toBe(schoolId);
    });
  });
});

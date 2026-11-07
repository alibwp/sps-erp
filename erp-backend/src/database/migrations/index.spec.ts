import { readdirSync } from 'node:fs';
import { migrations } from './index.js';

// A migration file left out of index.ts would never run.
describe('migration list', () => {
  const files = readdirSync(import.meta.dirname)
    .filter((file) => /^\d{13}-[A-Za-z0-9]+\.ts$/.test(file))
    .sort();

  it('registers every migration file, oldest first', () => {
    const expected = files.map((file) => {
      const [timestamp, name] = file.replace(/\.ts$/, '').split('-');
      return `${name}${timestamp}`;
    });
    expect(migrations.map((migration) => migration.name)).toEqual(expected);
  });

  it('has no file that does not follow <timestamp>-<Name>.ts', () => {
    const others = readdirSync(import.meta.dirname).filter(
      (file) =>
        !files.includes(file) && !['index.ts', 'index.spec.ts'].includes(file),
    );
    expect(others).toEqual([]);
  });
});

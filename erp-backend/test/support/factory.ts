import type {
  DataSource,
  DeepPartial,
  EntityTarget,
  ObjectLiteral,
} from 'typeorm';

// Test data with sensible defaults, overridable per test:
//
//   const schools = defineFactory(School, (n) => ({ name: `Campus ${n}`, timezone: 'UTC' }));
//   const school = await schools.create(dataSource, { timezone: 'Asia/Karachi' });
//
// `n` counts up per factory, so unique columns stay unique.
export function defineFactory<T extends ObjectLiteral>(
  entity: EntityTarget<T>,
  defaults: (n: number) => NoInfer<DeepPartial<T>>,
) {
  let sequence = 0;

  const build = (overrides?: DeepPartial<T>): DeepPartial<T> => {
    sequence += 1;
    return { ...defaults(sequence), ...overrides } as DeepPartial<T>;
  };

  const create = async (
    dataSource: DataSource,
    overrides?: DeepPartial<T>,
  ): Promise<T> => {
    const repository = dataSource.getRepository(entity);
    return repository.save(repository.create(build(overrides)));
  };

  const createMany = async (
    dataSource: DataSource,
    count: number,
    overrides?: DeepPartial<T>,
  ): Promise<T[]> => {
    const created: T[] = [];
    for (let i = 0; i < count; i++) {
      created.push(await create(dataSource, overrides));
    }
    return created;
  };

  return { build, create, createMany };
}

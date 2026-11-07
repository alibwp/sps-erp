import { ArgumentMetadata } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEmail, IsString, ValidateNested } from 'class-validator';
import { ValidationFailed } from '../errors/api-exception.js';
import { createValidationPipe, fieldErrors } from '../errors/validation.js';
import {
  DEFAULT_PER_PAGE,
  PaginationQueryDto,
  paginate,
  paginated,
  parseSort,
} from './pagination.js';

const pipe = createValidationPipe();
const asQuery = (metatype: ArgumentMetadata['metatype']): ArgumentMetadata => ({
  type: 'query',
  metatype,
});
const asBody = (metatype: ArgumentMetadata['metatype']): ArgumentMetadata => ({
  type: 'body',
  metatype,
});

async function rejection(
  value: unknown,
  metadata: ArgumentMetadata,
): Promise<ValidationFailed> {
  try {
    await pipe.transform(value, metadata);
  } catch (error) {
    if (error instanceof ValidationFailed) return error;
    throw error;
  }
  throw new Error('expected a validation error');
}

describe('PaginationQueryDto through the global ValidationPipe', () => {
  it('applies defaults and turns query strings into numbers', async () => {
    const query = await pipe.transform({}, asQuery(PaginationQueryDto));
    expect(query).toMatchObject({ page: 1, perPage: DEFAULT_PER_PAGE });

    const typed = await pipe.transform(
      { page: '3', perPage: '50' },
      asQuery(PaginationQueryDto),
    );
    expect(typed).toMatchObject({ page: 3, perPage: 50 });
  });

  it('accepts perPage 100 and rejects perPage above 100', async () => {
    await expect(
      pipe.transform({ perPage: '100' }, asQuery(PaginationQueryDto)),
    ).resolves.toMatchObject({
      perPage: 100,
    });
    const error = await rejection(
      { perPage: '101' },
      asQuery(PaginationQueryDto),
    );
    expect(Object.keys(error.fields ?? {})).toEqual(['perPage']);
  });

  it('rejects page 0, non-numbers and unknown query parameters', async () => {
    const error = await rejection(
      { page: '0', perPage: 'ten', colour: 'red' },
      asQuery(PaginationQueryDto),
    );
    expect(Object.keys(error.fields ?? {}).sort()).toEqual([
      'colour',
      'page',
      'perPage',
    ]);
  });
});

describe('parseSort', () => {
  const allowed = { name: 'student.name', createdAt: 'student.created_at' };

  it('maps fields to their columns and reads - as descending', () => {
    expect(parseSort('-createdAt, name', allowed)).toEqual([
      { column: 'student.created_at', direction: 'DESC' },
      { column: 'student.name', direction: 'ASC' },
    ]);
  });

  it('returns no terms when there is no sort', () => {
    expect(parseSort(undefined, allowed)).toEqual([]);
    expect(parseSort('  ', allowed)).toEqual([]);
  });

  it.each([
    'password',
    'name;DROP TABLE users',
    '-',
    'constructor',
    'createdAt,createdAt',
  ])('rejects %j with a 400 on the sort field', (sort) => {
    try {
      parseSort(sort, allowed);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationFailed);
      expect(Object.keys((error as ValidationFailed).fields ?? {})).toEqual([
        'sort',
      ]);
    }
  });
});

describe('paginate', () => {
  it('orders by allow-listed columns, pages, and builds the response', async () => {
    const qb = {
      orderBy: vi.fn(),
      addOrderBy: vi.fn(),
      skip: vi.fn(),
      take: vi.fn(),
      getManyAndCount: vi.fn().mockResolvedValue([[{ id: 'a' }], 41]),
    };
    qb.skip.mockReturnValue(qb);
    qb.take.mockReturnValue(qb);
    const query = Object.assign(new PaginationQueryDto(), {
      page: 3,
      perPage: 20,
      sort: '-name,id',
    });

    const result = await paginate(qb as never, query, {
      name: 's.name',
      id: 's.id',
    });

    expect(qb.orderBy).toHaveBeenCalledWith('s.name', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('s.id', 'ASC');
    expect(qb.skip).toHaveBeenCalledWith(40);
    expect(qb.take).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      data: [{ id: 'a' }],
      meta: { page: 3, perPage: 20, total: 41 },
    });
  });

  it('uses the default sort when the client sends none', async () => {
    const qb = {
      orderBy: vi.fn(),
      addOrderBy: vi.fn(),
      skip: vi.fn(),
      take: vi.fn(),
      getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
    };
    qb.skip.mockReturnValue(qb);
    qb.take.mockReturnValue(qb);

    await paginate(qb as never, new PaginationQueryDto(), {}, [
      { column: 's.created_at', direction: 'DESC' },
    ]);

    expect(qb.orderBy).toHaveBeenCalledWith('s.created_at', 'DESC');
  });

  it('paginated() wraps rows with page meta', () => {
    expect(paginated([1, 2], 2, { page: 1, perPage: 20 })).toEqual({
      data: [1, 2],
      meta: { page: 1, perPage: 20, total: 2 },
    });
  });
});

describe('fieldErrors', () => {
  class AddressDto {
    @IsString()
    city: string;
  }
  class PersonDto {
    @IsEmail()
    email: string;

    @ValidateNested()
    @Type(() => AddressDto)
    address: AddressDto;
  }

  it('flattens nested errors into dotted paths', async () => {
    const error = await rejection(
      { email: 'nope', address: { city: 7 } },
      asBody(PersonDto),
    );
    expect(error.fields).toEqual({
      email: ['email must be an email'],
      'address.city': ['city must be a string'],
    });
  });

  it('returns an empty object for no errors', () => {
    expect(fieldErrors([])).toEqual({});
  });
});

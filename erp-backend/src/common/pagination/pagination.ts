import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { ValidationFailed } from '../errors/api-exception.js';

export const MAX_PER_PAGE = 100;
export const DEFAULT_PER_PAGE = 20;

// Query string every list endpoint accepts. Extend it with the list's own
// filters.
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PER_PAGE,
    default: DEFAULT_PER_PAGE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PER_PAGE)
  perPage: number = DEFAULT_PER_PAGE;

  @ApiPropertyOptional({
    description:
      'Comma-separated fields; prefix a field with - to sort descending',
    example: '-createdAt,name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sort?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface SortTerm {
  column: string;
  direction: 'ASC' | 'DESC';
}

// Maps each sortable API field to the real column it orders by. Only these
// columns can ever reach ORDER BY.
export type SortAllowList = Record<string, string>;

export function parseSort(
  sort: string | undefined,
  allowed: SortAllowList,
): SortTerm[] {
  if (!sort?.trim()) return [];

  const terms: SortTerm[] = [];
  const seen = new Set<string>();
  for (const raw of sort.split(',')) {
    const token = raw.trim();
    const descending = token.startsWith('-');
    const field = descending ? token.slice(1) : token;
    const column = Object.hasOwn(allowed, field) ? allowed[field] : undefined;

    if (!column) {
      const names = Object.keys(allowed).join(', ') || 'none';
      throw new ValidationFailed({
        sort: [`Cannot sort by "${field}". Allowed fields: ${names}.`],
      });
    }
    if (seen.has(field)) {
      throw new ValidationFailed({ sort: [`"${field}" is listed twice.`] });
    }
    seen.add(field);
    terms.push({ column, direction: descending ? 'DESC' : 'ASC' });
  }
  return terms;
}

export function paginated<T>(
  data: T[],
  total: number,
  query: Pick<PaginationQueryDto, 'page' | 'perPage'>,
): Paginated<T> {
  return { data, meta: { page: query.page, perPage: query.perPage, total } };
}

// Applies sort, offset and limit to a query builder and returns one page.
// `defaultSort` keeps the order stable when the client sends no sort.
export async function paginate<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  query: PaginationQueryDto,
  allowed: SortAllowList,
  defaultSort: SortTerm[] = [],
): Promise<Paginated<T>> {
  const terms = parseSort(query.sort, allowed);
  for (const [index, term] of (terms.length ? terms : defaultSort).entries()) {
    if (index === 0) qb.orderBy(term.column, term.direction);
    else qb.addOrderBy(term.column, term.direction);
  }

  qb.skip((query.page - 1) * query.perPage).take(query.perPage);
  const [data, total] = await qb.getManyAndCount();
  return paginated(data, total, query);
}

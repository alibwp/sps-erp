import { NotFoundException } from '@nestjs/common';
import {
  type DeepPartial,
  type EntityManager,
  type EntityTarget,
  type FindOptionsWhere,
  IsNull,
  type ObjectLiteral,
  type SelectQueryBuilder,
} from 'typeorm';
import { currentRequest } from '../request-context/request-context.js';

// Campus ownership is enforced in one place.
//
// An entity that belongs to one campus (it has a school_id column) is marked
// @SchoolOwned(). Reads go through inSchool() or findInSchool() and inserts
// through newInSchool(); all three take the campus from the request context,
// which only ever holds a campus the signed-in person may work in (the
// checked X-School-Id header). A record of another campus is never found, so
// it answers 404.
//
// An entity whose school_id is set on purpose by the code that writes it is
// marked @NamesItsOwnSchool() instead: a membership grants access to the
// campus it names, a role assignment names where the role is held (null for
// a global role), a feature setting with no campus is the platform default,
// and an audit event names the campus it happened in. Filling those from the
// request would hide a mistake.
//
// test/tenancy (school-scope.spec.ts) fails when an entity has a school_id
// column and neither mark.

const schoolOwned = new Set<unknown>();
const namesItsOwnSchool = new Set<unknown>();

export function SchoolOwned(): ClassDecorator {
  return (target) => {
    schoolOwned.add(target);
  };
}

export function NamesItsOwnSchool(): ClassDecorator {
  return (target) => {
    namesItsOwnSchool.add(target);
  };
}

export function isSchoolOwned(target: unknown): boolean {
  return schoolOwned.has(target);
}

export function isNamingItsOwnSchool(target: unknown): boolean {
  return namesItsOwnSchool.has(target);
}

// The working campus of this request. Only campus routes have one.
export function workingSchoolId(): string {
  const schoolId = currentRequest()?.schoolId;
  if (!schoolId) {
    throw new Error(
      'This request has no working campus. Mark the route with @CampusRoute() or a campus permission.',
    );
  }
  return schoolId;
}

function mustBeSchoolOwned(entity: unknown): void {
  if (typeof entity !== 'function' || !schoolOwned.has(entity)) {
    const name = typeof entity === 'function' ? entity.name : String(entity);
    throw new Error(`${name} is not marked @SchoolOwned()`);
  }
}

export interface ScopeOptions {
  // Also match rows with no campus: shared records every campus can use,
  // such as the built-in roles.
  includeShared?: boolean;
  // The campus to scope to, when the code names one (a job, the CLI).
  schoolId?: string;
}

// Limits a query to the working campus.
export function inSchool<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  options: ScopeOptions = {},
): SelectQueryBuilder<T> {
  mustBeSchoolOwned(qb.expressionMap.mainAlias?.target);
  const schoolId = options.schoolId ?? workingSchoolId();
  return options.includeShared
    ? qb.andWhere(
        `(${qb.alias}.schoolId = :scopeSchoolId OR ${qb.alias}.schoolId IS NULL)`,
        { scopeSchoolId: schoolId },
      )
    : qb.andWhere(`${qb.alias}.schoolId = :scopeSchoolId`, {
        scopeSchoolId: schoolId,
      });
}

// One record of the working campus, or 404. `lock` holds the row with
// SELECT ... FOR UPDATE until the transaction ends.
export async function findInSchool<T extends ObjectLiteral>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  where: FindOptionsWhere<T>,
  options: ScopeOptions & { lock?: boolean; notFound?: string } = {},
): Promise<T> {
  mustBeSchoolOwned(entity);
  const schoolId = options.schoolId ?? workingSchoolId();
  const conditions = options.includeShared
    ? [
        { ...where, schoolId },
        { ...where, schoolId: IsNull() },
      ]
    : { ...where, schoolId };
  const found = await manager.findOne(entity, {
    where: conditions as FindOptionsWhere<T> | FindOptionsWhere<T>[],
    ...(options.lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
  });
  if (!found) throw new NotFoundException(options.notFound);
  return found;
}

// A new record of the working campus (not yet saved).
export function newInSchool<T extends ObjectLiteral>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  data: DeepPartial<T>,
  options: Pick<ScopeOptions, 'schoolId'> = {},
): T {
  mustBeSchoolOwned(entity);
  return manager.create(entity, {
    ...data,
    schoolId: options.schoolId ?? workingSchoolId(),
  } as DeepPartial<T>);
}

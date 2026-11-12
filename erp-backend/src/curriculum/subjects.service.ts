import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TransactionService } from '../common/database/transaction.service.js';
import { postgresCode } from '../common/errors/error-response.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import {
  type Paginated,
  type PaginationQueryDto,
  paginate,
} from '../common/pagination/pagination.js';
import {
  findInSchool,
  inSchool,
  newInSchool,
} from '../common/tenancy/school-scope.js';
import { CourseOffering } from './entities/course-offering.entity.js';
import { Subject } from './entities/subject.entity.js';

export const SUBJECT_NOT_FOUND = 'Subject not found.';

export const SubjectMessages = {
  nameTaken: 'This school already has a subject with that name.',
  taught:
    'This subject is taught, so it cannot be deleted. Close its course offerings first.',
} as const;

// A later stage that points at subjects says why one cannot be deleted
// (Stage 8: a subject on a published timetable).
export type SubjectDeleteCheck = (
  manager: EntityManager,
  subject: Subject,
) => Promise<string | null>;

// The campus's subject catalog (reference SubjectService). A subject that is
// taught is kept; deleting one keeps the row for history.
@Injectable()
export class Subjects {
  private readonly deleteChecks: SubjectDeleteCheck[] = [];

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
  ) {}

  registerDeleteCheck(check: SubjectDeleteCheck): void {
    this.deleteChecks.push(check);
  }

  list(
    schoolId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<Subject>> {
    const qb = inSchool(
      this.dataSource.manager.createQueryBuilder(Subject, 'subject'),
      { schoolId },
    );
    if (query.search) {
      qb.andWhere(
        '(subject.name ILIKE :search OR subject.shortName ILIKE :search)',
        { search: `%${query.search.replace(/[\\%_]/g, '')}%` },
      );
    }
    return paginate(
      qb,
      query,
      {
        name: 'subject.name',
        shortName: 'subject.shortName',
        createdAt: 'subject.createdAt',
      },
      [{ column: 'subject.name', direction: 'ASC' }],
    );
  }

  find(
    manager: EntityManager,
    schoolId: string,
    id: string,
    lock = false,
  ): Promise<Subject> {
    return findInSchool(
      manager,
      Subject,
      { id },
      { schoolId, lock, notFound: SUBJECT_NOT_FOUND },
    );
  }

  async create(
    schoolId: string,
    input: { name: string; shortName: string },
  ): Promise<Subject> {
    return this.unique(() =>
      this.transactions.run(async (tx) => {
        const manager = tx.manager;
        const name = input.name.trim();
        await this.refuseTaken(manager, schoolId, name);
        return manager.save(
          newInSchool(
            manager,
            Subject,
            { name, shortName: input.shortName.trim() },
            { schoolId },
          ),
        );
      }),
    );
  }

  async update(
    schoolId: string,
    id: string,
    input: { name?: string; shortName?: string },
  ): Promise<Subject> {
    return this.unique(() =>
      this.transactions.run(async (tx) => {
        const manager = tx.manager;
        const subject = await this.find(manager, schoolId, id, true);
        const name = input.name?.trim();
        if (name && name.toLowerCase() !== subject.name.toLowerCase()) {
          await this.refuseTaken(manager, schoolId, name, subject.id);
        }
        subject.name = name ?? subject.name;
        subject.shortName = input.shortName?.trim() ?? subject.shortName;
        return manager.save(subject);
      }),
    );
  }

  async delete(schoolId: string, id: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const subject = await this.find(manager, schoolId, id, true);
      if (
        await manager.exists(CourseOffering, {
          where: { subjectId: subject.id },
        })
      ) {
        throw new RuleViolation(SubjectMessages.taught);
      }
      for (const check of this.deleteChecks) {
        const refusal = await check(manager, subject);
        if (refusal) throw new RuleViolation(refusal);
      }
      await manager.softDelete(Subject, { id: subject.id });
    });
  }

  private async refuseTaken(
    manager: EntityManager,
    schoolId: string,
    name: string,
    ignoreId?: string,
  ): Promise<void> {
    const taken = await manager
      .createQueryBuilder(Subject, 'subject')
      .where('subject.schoolId = :schoolId', { schoolId })
      .andWhere('lower(subject.name) = lower(:name)', { name })
      .andWhere(ignoreId ? 'subject.id <> :ignoreId' : '1 = 1', { ignoreId })
      .getExists();
    if (taken) {
      throw new RuleViolation(SubjectMessages.nameTaken, {
        name: [SubjectMessages.nameTaken],
      });
    }
  }

  private async unique<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (postgresCode(error) !== '23505') throw error;
      throw new RuleViolation(SubjectMessages.nameTaken, {
        name: [SubjectMessages.nameTaken],
      });
    }
  }
}

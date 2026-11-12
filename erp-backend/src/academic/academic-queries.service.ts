import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { paginate, type Paginated } from '../common/pagination/pagination.js';
import { findInSchool, inSchool } from '../common/tenancy/school-scope.js';
import { School } from '../organizations/entities/school.entity.js';
import type {
  PeriodDto,
  StatusHistoryDto,
  YearDetailDto,
  YearDto,
  YearListQueryDto,
} from './academic.dto.js';
import {
  AcademicPeriod,
  displayName,
} from './entities/academic-period.entity.js';
import {
  AcademicPeriodStatusChange,
  type PeriodKind,
} from './entities/academic-period-status-change.entity.js';
import { AcademicYear, yearName } from './entities/academic-year.entity.js';

// Read models for the academic calendar of the working campus.
@Injectable()
export class AcademicQueries {
  constructor(private readonly dataSource: DataSource) {}

  async years(
    schoolId: string,
    query: YearListQueryDto,
  ): Promise<Paginated<YearDto>> {
    const qb = inSchool(
      this.dataSource.manager.createQueryBuilder(AcademicYear, 'year'),
      {
        schoolId,
      },
    );
    if (query.status)
      qb.andWhere('year.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere(
        '(year.startYear::text LIKE :search OR year.stopYear::text LIKE :search)',
        {
          search: `%${query.search.replace(/[\\%_]/g, '')}%`,
        },
      );
    }
    const page = await paginate(
      qb,
      query,
      {
        startsOn: 'year.startsOn',
        createdAt: 'year.createdAt',
        status: 'year.status',
      },
      [{ column: 'year.startsOn', direction: 'DESC' }],
    );
    const school = await this.school(schoolId);
    return {
      data: page.data.map((year) => this.year(year, school)),
      meta: page.meta,
    };
  }

  async yearDetail(schoolId: string, yearId: string): Promise<YearDetailDto> {
    const year = await findInSchool(
      this.dataSource.manager,
      AcademicYear,
      { id: yearId },
      { schoolId, notFound: 'Academic year not found.' },
    );
    const periods = await this.dataSource.manager.find(AcademicPeriod, {
      where: { academicYearId: year.id },
      order: { position: 'ASC', startsOn: 'ASC', createdAt: 'ASC' },
    });
    return {
      ...this.year(year, await this.school(schoolId)),
      periods: this.tree(periods, null),
    };
  }

  async periodDetail(schoolId: string, periodId: string): Promise<PeriodDto> {
    const period = await findInSchool(
      this.dataSource.manager,
      AcademicPeriod,
      { id: periodId },
      { schoolId, notFound: 'Academic period not found.' },
    );
    const children = await this.dataSource.manager.find(AcademicPeriod, {
      where: { parentId: period.id },
      order: { position: 'ASC', startsOn: 'ASC' },
    });
    return {
      ...this.period(period),
      children: children.map((child) => this.period(child)),
    };
  }

  async history(
    schoolId: string,
    kind: PeriodKind,
    id: string,
  ): Promise<StatusHistoryDto[]> {
    await findInSchool(
      this.dataSource.manager,
      kind === 'academic_year' ? AcademicYear : AcademicPeriod,
      { id },
      {
        schoolId,
        notFound:
          kind === 'academic_year'
            ? 'Academic year not found.'
            : 'Academic period not found.',
      },
    );
    const rows = await this.dataSource.manager.find(
      AcademicPeriodStatusChange,
      {
        where: { periodType: kind, periodId: id },
        order: { createdAt: 'ASC' },
      },
    );
    return rows.map((row) => ({
      id: row.id,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      changedById: row.changedById,
      reason: row.reason,
      checklist: row.checklist,
      createdAt: row.createdAt,
    }));
  }

  year(year: AcademicYear, school: Pick<School, 'academicYearId'>): YearDto {
    return {
      id: year.id,
      name: yearName(year),
      startYear: year.startYear,
      stopYear: year.stopYear,
      startsOn: year.startsOn,
      endsOn: year.endsOn,
      status: year.status,
      isCampusDefault: school.academicYearId === year.id,
      createdAt: year.createdAt,
    };
  }

  period(period: AcademicPeriod): PeriodDto {
    return {
      id: period.id,
      academicYearId: period.academicYearId,
      parentId: period.parentId,
      name: period.name,
      label: period.label,
      displayName: displayName(period),
      type: period.type,
      position: period.position,
      startsOn: period.startsOn,
      endsOn: period.endsOn,
      status: period.status,
      children: [],
    };
  }

  private tree(
    periods: AcademicPeriod[],
    parentId: string | null,
  ): PeriodDto[] {
    return periods
      .filter((period) => period.parentId === parentId)
      .map((period) => ({
        ...this.period(period),
        children: this.tree(periods, period.id),
      }));
  }

  private school(schoolId: string): Promise<School> {
    return this.dataSource.manager.findOneOrFail(School, {
      where: { id: schoolId },
    });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Not } from 'typeorm';
import { OrganizationPermission } from '../access/access.constants.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { addDays } from '../common/clock/dates.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { newInSchool } from '../common/tenancy/school-scope.js';
import { School } from '../organizations/entities/school.entity.js';
import { OrganizationAccess } from '../organizations/organization-access.service.js';
import { type PeriodType, YEAR_SUBJECT } from './academic.constants.js';
import { AcademicCalendar } from './academic-calendar.service.js';
import { AcademicPeriod } from './entities/academic-period.entity.js';
import { AcademicYear, yearName } from './entities/academic-year.entity.js';
import { CalendarTemplatePeriod } from './entities/calendar-template-period.entity.js';
import { CalendarTemplate } from './entities/calendar-template.entity.js';

export interface TemplatePeriodInput {
  name: string;
  label?: string | null;
  type: PeriodType;
  position: number;
  startOffsetDays: number;
  lengthDays: number;
  // 1-based row number of an earlier row in the list.
  parentIndex?: number | null;
}

export interface TemplateInput {
  name: string;
  description?: string | null;
  cycleLengthDays: number;
  isDefault?: boolean;
  autoOpen?: boolean;
  generateAheadWeeks: number;
  remindDaysBefore: number;
  periods: TemplatePeriodInput[];
}

export interface TemplateView {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  cycleLengthDays: number;
  autoOpen: boolean;
  generateAheadWeeks: number;
  remindDaysBefore: number;
  periods: Array<
    Pick<
      CalendarTemplatePeriod,
      | 'id'
      | 'parentId'
      | 'name'
      | 'label'
      | 'type'
      | 'position'
      | 'startOffsetDays'
      | 'lengthDays'
    >
  >;
  createdAt: Date;
}

export const TemplateMessages = {
  noPeriods: 'Add at least one period to the calendar template.',
  parent: (row: number) =>
    `Row ${row} must name an earlier, filled row as its parent.`,
  tooLong: (row: number) =>
    `Row ${row} ends after the school year ends. Shorten it or start it earlier.`,
  insideParent: (row: number, parent: number) =>
    `Row ${row} must fall inside row ${parent}, its parent.`,
  shareDays: (other: number, row: number) =>
    `Rows ${other} and ${row} share days. Periods side by side must not overlap.`,
  otherOrganization: 'That calendar template belongs to another organization.',
  noTemplate:
    'This campus has no calendar template. Choose one, or set a default for the organization.',
  overrideReason: 'Say why this campus needs a calendar of its own.',
  cycleOverlap: (name: string, start: string, end: string) =>
    `This cycle runs over ${name}, which covers ${start} to ${end}.`,
} as const;

export const TEMPLATE_SUBJECT = 'calendar_template';
export const TEMPLATE_NOT_FOUND = 'Calendar template not found.';

// The rows of a template must nest inside their parent, fit in the cycle,
// and not overlap their siblings (reference SaveCalendarTemplate).
export function checkTemplatePeriods(
  rows: TemplatePeriodInput[],
  cycleLengthDays: number,
): void {
  if (!rows.length) throw new RuleViolation(TemplateMessages.noPeriods);
  const spans = new Map<
    number,
    { start: number; end: number; parent: number | null }
  >();
  rows.forEach((row, index) => {
    const number = index + 1;
    const start = row.startOffsetDays;
    const end = start + Math.max(row.lengthDays, 1) - 1;
    const parent = row.parentIndex ?? null;
    if (parent !== null && (parent >= number || !spans.has(parent))) {
      throw new RuleViolation(TemplateMessages.parent(number));
    }
    if (end >= cycleLengthDays) {
      throw new RuleViolation(TemplateMessages.tooLong(number));
    }
    if (parent !== null) {
      const outer = spans.get(parent)!;
      if (start < outer.start || end > outer.end) {
        throw new RuleViolation(TemplateMessages.insideParent(number, parent));
      }
    }
    for (const [other, span] of spans) {
      if (span.parent === parent && start <= span.end && end >= span.start) {
        throw new RuleViolation(TemplateMessages.shareDays(other, number));
      }
    }
    spans.set(number, { start, end, parent });
  });
}

// An organization's calendar templates, campus overrides and cycle
// generation (reference SaveCalendarTemplate, SetCampusCalendarTemplate,
// GenerateAcademicCycle). Writes need "manage organization"
// (OrganizationPolicy::manageCalendar).
@Injectable()
export class CalendarTemplates {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly access: OrganizationAccess,
    private readonly calendar: AcademicCalendar,
    private readonly audit: AuditService,
  ) {}

  async list(actorId: string, organizationId: string): Promise<TemplateView[]> {
    const manager = this.dataSource.manager;
    await this.access.authorize(
      manager,
      actorId,
      organizationId,
      OrganizationPermission.Read,
    );
    const templates = await manager.find(CalendarTemplate, {
      where: { organizationId },
      order: { name: 'ASC' },
    });
    return Promise.all(
      templates.map((template) => this.view(manager, template)),
    );
  }

  async show(
    actorId: string,
    organizationId: string,
    templateId: string,
  ): Promise<TemplateView> {
    const manager = this.dataSource.manager;
    await this.access.authorize(
      manager,
      actorId,
      organizationId,
      OrganizationPermission.Read,
    );
    return this.view(
      manager,
      await this.templateOf(manager, organizationId, templateId),
    );
  }

  async save(
    actorId: string,
    organizationId: string,
    input: TemplateInput,
    templateId?: string,
  ): Promise<TemplateView> {
    checkTemplatePeriods(input.periods, input.cycleLengthDays);
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      await this.access.authorize(
        manager,
        actorId,
        organizationId,
        OrganizationPermission.Manage,
        {
          lock: true,
        },
      );
      let template = templateId
        ? await this.templateOf(manager, organizationId, templateId, true)
        : manager.create(CalendarTemplate, {
            organizationId,
            createdById: actorId,
          });
      const isDefault = input.isDefault ?? false;
      if (isDefault) {
        await manager.update(
          CalendarTemplate,
          {
            organizationId,
            isDefault: true,
            ...(template.id ? { id: Not(template.id) } : {}),
          },
          { isDefault: false },
        );
      }
      Object.assign(template, {
        name: input.name,
        description: input.description ?? null,
        cycleLengthDays: input.cycleLengthDays,
        isDefault,
        autoOpen: input.autoOpen ?? false,
        generateAheadWeeks: input.generateAheadWeeks,
        remindDaysBefore: input.remindDaysBefore,
      });
      template = await manager.save(template);

      await manager.delete(CalendarTemplatePeriod, {
        calendarTemplateId: template.id,
      });
      const written: CalendarTemplatePeriod[] = [];
      for (const row of input.periods) {
        written.push(
          await manager.save(
            manager.create(CalendarTemplatePeriod, {
              calendarTemplateId: template.id,
              parentId: row.parentIndex
                ? written[row.parentIndex - 1].id
                : null,
              name: row.name.trim(),
              label: row.label?.trim() || null,
              type: row.type,
              position: row.position,
              startOffsetDays: row.startOffsetDays,
              lengthDays: row.lengthDays,
            }),
          ),
        );
      }
      await this.audit.record(manager, {
        action: AuditAction.CalendarTemplateSaved,
        subject: { type: TEMPLATE_SUBJECT, id: template.id },
        context: {
          organization_id: organizationId,
          period_count: written.length,
          is_default: template.isDefault,
        },
        schoolId: null,
      });
      return this.view(manager, template);
    });
  }

  // A campus follows a template of its own (with a reason), or the
  // organization default again (templateId null).
  async setCampusTemplate(
    actorId: string,
    organizationId: string,
    schoolId: string,
    templateId: string | null,
    reason: string | null,
  ): Promise<School> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      await this.access.authorize(
        manager,
        actorId,
        organizationId,
        OrganizationPermission.Manage,
      );
      const school = await this.campusOf(
        manager,
        organizationId,
        schoolId,
        true,
      );
      const why = reason?.trim() || null;
      if (templateId !== null) {
        const template = await manager.findOne(CalendarTemplate, {
          where: { id: templateId },
        });
        if (!template) throw new NotFoundException(TEMPLATE_NOT_FOUND);
        if (template.organizationId !== organizationId) {
          throw new RuleViolation(TemplateMessages.otherOrganization);
        }
        if (!why) {
          throw new RuleViolation(TemplateMessages.overrideReason, {
            reason: [TemplateMessages.overrideReason],
          });
        }
      }
      const before = school.calendarTemplateId;
      if (before === templateId) return school;
      school.calendarTemplateId = templateId;
      const saved = await manager.save(school);
      await this.audit.record(manager, {
        action: AuditAction.CampusCalendarOverridden,
        subject: { type: 'school', id: school.id },
        context: {
          from: before,
          to: templateId,
          inherits: templateId === null,
          reason: why,
        },
        schoolId: school.id,
      });
      return saved;
    });
  }

  // Drafts a year for a campus from a template (its own, or the one it
  // follows), with every period dated from the cycle start.
  async generate(
    actorId: string,
    organizationId: string,
    schoolId: string,
    startsOn: string,
    templateId: string | null,
  ): Promise<AcademicYear> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      await this.access.authorize(
        manager,
        actorId,
        organizationId,
        OrganizationPermission.Manage,
      );
      const school = await this.campusOf(manager, organizationId, schoolId);
      let template: CalendarTemplate | null = null;
      if (templateId) {
        template = await manager.findOne(CalendarTemplate, {
          where: { id: templateId },
        });
        if (!template) throw new NotFoundException(TEMPLATE_NOT_FOUND);
      }
      return this.generateIn(manager, school, startsOn, template, actorId);
    });
  }

  // Also used by the weekly job, which drafts the next cycle.
  async generateIn(
    manager: EntityManager,
    school: School,
    startsOn: string,
    template: CalendarTemplate | null,
    actorId?: string | null,
  ): Promise<AcademicYear> {
    template ??= await this.effectiveTemplate(manager, school);
    if (!template) throw new RuleViolation(TemplateMessages.noTemplate);
    if (template.organizationId !== school.organizationId) {
      throw new RuleViolation(TemplateMessages.otherOrganization);
    }
    const endsOn = addDays(startsOn, Math.max(template.cycleLengthDays, 1) - 1);

    await this.calendar.lockSchool(manager, school.id);
    const clash = await manager
      .createQueryBuilder(AcademicYear, 'year')
      .where('year.schoolId = :schoolId', { schoolId: school.id })
      .andWhere('year.startsOn IS NOT NULL AND year.endsOn IS NOT NULL')
      .andWhere('year.startsOn <= :endsOn AND year.endsOn >= :startsOn', {
        startsOn,
        endsOn,
      })
      .getOne();
    if (clash) {
      throw new RuleViolation(
        TemplateMessages.cycleOverlap(
          yearName(clash),
          clash.startsOn!,
          clash.endsOn!,
        ),
      );
    }

    const year = await manager.save(
      newInSchool(
        manager,
        AcademicYear,
        {
          startYear: Number(startsOn.slice(0, 4)),
          stopYear: Number(endsOn.slice(0, 4)),
          startsOn,
          endsOn,
          status: 'draft',
        },
        { schoolId: school.id },
      ),
    );
    const rows = await manager.find(CalendarTemplatePeriod, {
      where: { calendarTemplateId: template.id },
      order: { position: 'ASC', startOffsetDays: 'ASC' },
    });
    const created = await this.createPeriods(
      manager,
      rows,
      year,
      startsOn,
      null,
      null,
    );

    await this.audit.record(manager, {
      action: AuditAction.AcademicCycleGenerated,
      subject: { type: YEAR_SUBJECT, id: year.id },
      context: {
        template_id: template.id,
        template_name: template.name,
        starts_on: startsOn,
        ends_on: endsOn,
        periods: created,
      },
      schoolId: school.id,
      ...(actorId !== undefined ? { actorId } : {}),
    });
    return year;
  }

  // The campus's own template, else the organization default.
  async effectiveTemplate(
    manager: EntityManager,
    school: School,
  ): Promise<CalendarTemplate | null> {
    if (school.calendarTemplateId) {
      return manager.findOne(CalendarTemplate, {
        where: { id: school.calendarTemplateId },
      });
    }
    return manager.findOne(CalendarTemplate, {
      where: { organizationId: school.organizationId, isDefault: true },
    });
  }

  private async createPeriods(
    manager: EntityManager,
    rows: CalendarTemplatePeriod[],
    year: AcademicYear,
    cycleStart: string,
    templateParentId: string | null,
    parentId: string | null,
  ): Promise<number> {
    let written = 0;
    for (const row of rows.filter(
      (candidate) => candidate.parentId === templateParentId,
    )) {
      const startsOn = addDays(cycleStart, row.startOffsetDays);
      const period = await manager.save(
        newInSchool(
          manager,
          AcademicPeriod,
          {
            academicYearId: year.id,
            parentId,
            name: row.name,
            label: row.label,
            type: row.type,
            position: row.position,
            startsOn,
            endsOn: addDays(startsOn, Math.max(row.lengthDays, 1) - 1),
            status: 'draft',
          },
          { schoolId: year.schoolId },
        ),
      );
      written +=
        1 +
        (await this.createPeriods(
          manager,
          rows,
          year,
          cycleStart,
          row.id,
          period.id,
        ));
    }
    return written;
  }

  private async view(
    manager: EntityManager,
    template: CalendarTemplate,
  ): Promise<TemplateView> {
    const periods = await manager.find(CalendarTemplatePeriod, {
      where: { calendarTemplateId: template.id },
      order: { position: 'ASC', startOffsetDays: 'ASC' },
    });
    return {
      id: template.id,
      organizationId: template.organizationId,
      name: template.name,
      description: template.description,
      isDefault: template.isDefault,
      cycleLengthDays: template.cycleLengthDays,
      autoOpen: template.autoOpen,
      generateAheadWeeks: template.generateAheadWeeks,
      remindDaysBefore: template.remindDaysBefore,
      periods: periods.map((row) => ({
        id: row.id,
        parentId: row.parentId,
        name: row.name,
        label: row.label,
        type: row.type,
        position: row.position,
        startOffsetDays: row.startOffsetDays,
        lengthDays: row.lengthDays,
      })),
      createdAt: template.createdAt,
    };
  }

  private async templateOf(
    manager: EntityManager,
    organizationId: string,
    templateId: string,
    lock = false,
  ): Promise<CalendarTemplate> {
    const template = await manager.findOne(CalendarTemplate, {
      where: { id: templateId, organizationId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!template) throw new NotFoundException(TEMPLATE_NOT_FOUND);
    return template;
  }

  private async campusOf(
    manager: EntityManager,
    organizationId: string,
    schoolId: string,
    lock = false,
  ): Promise<School> {
    const school = await manager.findOne(School, {
      where: { id: schoolId, organizationId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!school) throw new NotFoundException('Campus not found.');
    return school;
  }
}

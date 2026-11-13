import { Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { AcademicPeriod } from './entities/academic-period.entity.js';
import type { AcademicYear } from './entities/academic-year.entity.js';

// One thing standing between a period and its close (reference
// ClosureFinding). A blocking finding refuses the close unless it is forced.
export interface ClosureFinding {
  key: string;
  summary: string;
  count: number;
  blocking: boolean;
}

// A check later stages add for each period: draft timetables (Stage 8,
// warning) and incomplete grade entries (Stage 10, blocking).
export type PeriodClosureCheck = (
  manager: EntityManager,
  period: AcademicPeriod,
) => Promise<ClosureFinding>;

// What closing a year or a period would leave behind (reference
// app/Services/Calendar/ClosureReadinessCheck.php). The findings are stored
// with the close in the status history.
@Injectable()
export class ClosureReadiness {
  private readonly checks: PeriodClosureCheck[] = [];

  // Called by the modules that own the checked records, at start-up.
  register(check: PeriodClosureCheck): void {
    this.checks.push(check);
  }

  async forPeriod(
    manager: EntityManager,
    period: AcademicPeriod,
  ): Promise<ClosureFinding[]> {
    return (await this.periodFindings(manager, period)).filter(
      (finding) => finding.count > 0,
    );
  }

  // Closing a year closes the periods still open in it: that is told, not
  // refused. Every period's own findings are added up by key.
  async forYear(
    manager: EntityManager,
    year: AcademicYear,
  ): Promise<ClosureFinding[]> {
    const periods = await manager.find(AcademicPeriod, {
      where: { academicYearId: year.id },
      order: { position: 'ASC', createdAt: 'ASC' },
    });
    const openPeriods = await manager.count(AcademicPeriod, {
      where: { academicYearId: year.id, status: In(['open', 'closing']) },
    });
    const findings: ClosureFinding[] = [
      {
        key: 'open_periods',
        summary:
          'Closing this cycle will also close the periods still open in it.',
        count: openPeriods,
        blocking: false,
      },
    ];
    for (const period of periods) {
      findings.push(...(await this.periodFindings(manager, period)));
    }
    return merge(findings).filter((finding) => finding.count > 0);
  }

  private async periodFindings(
    manager: EntityManager,
    period: AcademicPeriod,
  ): Promise<ClosureFinding[]> {
    const findings: ClosureFinding[] = [];
    for (const check of this.checks)
      findings.push(await check(manager, period));
    return findings;
  }
}

function merge(findings: ClosureFinding[]): ClosureFinding[] {
  const merged = new Map<string, ClosureFinding>();
  for (const finding of findings) {
    const existing = merged.get(finding.key);
    merged.set(finding.key, {
      ...finding,
      count: (existing?.count ?? 0) + finding.count,
    });
  }
  return [...merged.values()];
}

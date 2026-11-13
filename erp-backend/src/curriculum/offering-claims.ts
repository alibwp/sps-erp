import type { RosterMode } from '../academic/academic.constants.js';
import { usesHomeSections } from './curriculum.constants.js';

// What a year already teaches per period and level of one subject, as the
// reference's RollForwardCourseOfferings::plan counts it. A section-based
// offering claims its own sections; a whole-level offering claims the whole
// level (null); named-learner offerings are counted, because one level can
// run several of them (Algebra A and Algebra B).
export class OfferingClaims {
  private readonly sections = new Map<string, Array<string[] | null>>();
  private readonly named = new Map<string, number>();

  static key(subjectId: string, periodId: string, levelId: string): string {
    return `${subjectId}:${periodId}:${levelId}`;
  }

  // Records an offering the year has.
  add(key: string, mode: RosterMode, sectionIds: string[]): void {
    if (mode === 'individual_roster') {
      this.named.set(key, (this.named.get(key) ?? 0) + 1);
      return;
    }
    const claims = this.sections.get(key) ?? [];
    claims.push(usesHomeSections(mode) ? [...sectionIds] : null);
    this.sections.set(key, claims);
  }

  // Whether an offering with this roster is taught already. A named-learner
  // offering uses up one counted claim, so two named offerings in the
  // source map onto two in the target.
  taken(key: string, mode: RosterMode, sectionIds: string[]): boolean {
    const claims = this.sections.get(key) ?? [];
    if (mode === 'individual_roster') {
      if (claims.includes(null)) return true;
      const named = this.named.get(key) ?? 0;
      if (named > 0) {
        this.named.set(key, named - 1);
        return true;
      }
      return false;
    }
    const wanted = usesHomeSections(mode) ? sectionIds : null;
    for (const claim of claims) {
      if (
        claim === null ||
        wanted === null ||
        claim.some((id) => wanted.includes(id))
      ) {
        return true;
      }
    }
    return wanted === null && (this.named.get(key) ?? 0) > 0;
  }
}

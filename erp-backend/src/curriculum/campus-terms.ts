import type { EntityManager } from 'typeorm';
import { SchoolOperatingProfile } from '../organizations/entities/school-operating-profile.entity.js';

// The campus's own words for a class, a section and a class teacher, in
// lower case, as the reference's school_term() and school_terms() give them
// to its messages.
export interface CampusTerms {
  class: string;
  classes: string;
  section: string;
  sections: string;
  homeroomTeacher: string;
  period: string;
  academicYear: string;
}

// Str::plural for the words a campus picks.
export function plural(word: string): string {
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

// with_indefinite_article: "a section", "an arm", "a unit".
export function withArticle(noun: string): string {
  const vowel = /^[aeiou]/i.test(noun) && !/^(uni|use|usu|eu|one)/i.test(noun);
  return `${vowel ? 'an' : 'a'} ${noun}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const DEFAULT_TERMS: CampusTerms = {
  class: 'class',
  classes: 'classes',
  section: 'section',
  sections: 'sections',
  homeroomTeacher: 'class teacher',
  period: 'period',
  academicYear: 'school year',
};

export async function campusTerms(
  manager: EntityManager,
  schoolId: string,
): Promise<CampusTerms> {
  const profile = await manager.findOne(SchoolOperatingProfile, {
    where: { schoolId },
  });
  const labels = profile?.labels ?? {};
  const word = (key: string, fallback: string) =>
    (labels[key]?.trim() || fallback).toLowerCase();
  const classWord = word('class_level', 'class');
  const sectionWord = word('section', 'section');
  return {
    class: classWord,
    classes: plural(classWord),
    section: sectionWord,
    sections: plural(sectionWord),
    homeroomTeacher: word('homeroom_teacher', 'class teacher'),
    period: word('period', 'period'),
    academicYear: word('academic_year', 'school year'),
  };
}

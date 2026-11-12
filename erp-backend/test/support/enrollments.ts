import type { School } from '../../src/organizations/entities/school.entity.js';
import type { Person } from './campus.js';
import { makeSection } from './curriculum.js';

let counter = 0;

export interface Admitted {
  id: string;
  userId: string;
  name: string;
  email: string;
  admissionNumber: string;
  status: string;
  section: { id: string } | null;
}

// The body of an admission, with a fresh name and address.
export function admission(
  sectionId: string,
  fields: Record<string, unknown> = {},
) {
  counter += 1;
  return {
    name: `Learner ${counter}`,
    email: `learner.${counter}.${Date.now().toString(36)}@school.test`,
    academicCycleSectionId: sectionId,
    ...fields,
  };
}

export async function admit(
  admin: Person,
  school: School,
  sectionId: string,
  fields: Record<string, unknown> = {},
): Promise<Admitted> {
  const res = await admin
    .as(school)
    .post('/api/v1/students')
    .send(admission(sectionId, fields))
    .expect(201);
  return res.body;
}

// An active section of a level in a year.
export async function activeSection(
  admin: Person,
  school: School,
  yearId: string,
  levelId: string,
  fields: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const section = await makeSection(admin, school, yearId, levelId, fields);
  await admin
    .as(school)
    .post(`/api/v1/academic-cycle-sections/${section.id}/status`)
    .send({ status: 'active' })
    .expect(200);
  return section;
}

export function changeStatus(
  admin: Person,
  school: School,
  enrollmentId: string,
  body: Record<string, unknown>,
) {
  return admin
    .as(school)
    .post(`/api/v1/students/${enrollmentId}/status-changes`)
    .send(body);
}

export function place(
  admin: Person,
  school: School,
  enrollmentId: string,
  body: Record<string, unknown>,
) {
  return admin
    .as(school)
    .post(`/api/v1/students/${enrollmentId}/placements`)
    .send(body);
}

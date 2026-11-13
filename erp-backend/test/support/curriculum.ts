import type { INestApplication } from '@nestjs/common';
import type { School } from '../../src/organizations/entities/school.entity.js';
import { type Person, person } from './campus.js';

export interface Level {
  id: string;
  name: string;
  parentId: string | null;
  isGroup: boolean;
  status: string;
  position: number;
}

export interface Section {
  id: string;
  name: string;
  academicLevelId: string;
  status: string;
}

export interface Offering {
  id: string;
  subject: { id: string; name: string };
  academicPeriodId: string;
  academicLevelId: string;
  rosterMode: string;
  status: string;
  academicCycleSectionIds: string[];
  studentRecordIds: string[];
}

let counter = 0;
const next = () => {
  counter += 1;
  return counter;
};

export async function makeLevel(
  admin: Person,
  school: School,
  body: Record<string, unknown> = {},
): Promise<Level> {
  const res = await admin
    .as(school)
    .post('/api/v1/academic-levels')
    .send({ name: `Grade ${next()}`, ...body })
    .expect(201);
  return res.body;
}

export async function makeSection(
  admin: Person,
  school: School,
  academicYearId: string,
  academicLevelId: string,
  body: Record<string, unknown> = {},
): Promise<Section> {
  const res = await admin
    .as(school)
    .post('/api/v1/academic-cycle-sections')
    .send({ academicYearId, academicLevelId, name: `Arm ${next()}`, ...body })
    .expect(201);
  return res.body;
}

export async function makeSubject(
  admin: Person,
  school: School,
  name = `Subject ${next()}`,
): Promise<{ id: string; name: string }> {
  const res = await admin
    .as(school)
    .post('/api/v1/subjects')
    .send({ name, shortName: name.slice(0, 4) })
    .expect(201);
  return res.body;
}

// Creates offerings and returns them (one per period).
export async function makeOfferings(
  admin: Person,
  school: School,
  body: Record<string, unknown>,
): Promise<Offering[]> {
  const res = await admin
    .as(school)
    .post('/api/v1/course-offerings')
    .send(body)
    .expect(201);
  return res.body;
}

// A teacher of the campus: an active member holding the teacher role there.
export function teacherOf(
  app: INestApplication,
  school: School,
): Promise<Person> {
  return person(app, { memberOf: [school], roles: [['teacher', school]] });
}

import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { School } from '../../src/organizations/entities/school.entity.js';
import { type Person, person } from './campus.js';

// A school year from 1 September to 31 July with three terms.
export function calendarBody(startYear: number) {
  const next = startYear + 1;
  return {
    startsOn: `${startYear}-09-01`,
    endsOn: `${next}-07-31`,
    periods: [
      {
        name: 'First term',
        type: 'term',
        startsOn: `${startYear}-09-01`,
        endsOn: `${startYear}-12-15`,
      },
      {
        name: 'Second term',
        type: 'term',
        startsOn: `${next}-01-05`,
        endsOn: `${next}-03-31`,
      },
      {
        name: 'Third term',
        type: 'term',
        startsOn: `${next}-04-15`,
        endsOn: `${next}-07-31`,
      },
    ],
  };
}

export interface CalendarYear {
  id: string;
  name: string;
  status: string;
  periods: Array<{
    id: string;
    name: string;
    status: string;
    children: unknown[];
  }>;
}

// Creates a draft calendar through the API, and publishes it when asked.
export async function createCalendar(
  admin: Person,
  school: School,
  body = calendarBody(2026),
  publish = false,
): Promise<CalendarYear> {
  const created = await admin
    .as(school)
    .post('/api/v1/academic-years')
    .send(body)
    .expect(201);
  if (!publish) return created.body;
  const published = await admin
    .as(school)
    .post(`/api/v1/academic-years/${created.body.id}/publish`)
    .expect(200);
  return published.body;
}

export function period(year: CalendarYear, name: string) {
  const found = year.periods.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No period ${name}`);
  return found;
}

export async function statusOf(
  app: INestApplication,
  table: 'academic_years' | 'academic_periods',
  id: string,
): Promise<string> {
  const [row] = await app
    .get(DataSource)
    .query(`SELECT status FROM ${table} WHERE id = $1`, [id]);
  return row.status;
}

export async function history(app: INestApplication, id: string) {
  return (await app
    .get(DataSource)
    .query(
      'SELECT from_status, to_status, reason, checklist, changed_by FROM academic_period_status_changes WHERE period_id = $1 ORDER BY created_at',
      [id],
    )) as Array<{
    from_status: string;
    to_status: string;
    reason: string | null;
    checklist: unknown[] | null;
    changed_by: string | null;
  }>;
}

let roleCounter = 0;

// A member of the campus whose only role there holds exactly these
// permissions.
export async function personWith(
  app: INestApplication,
  school: School,
  permissions: string[],
): Promise<Person> {
  roleCounter += 1;
  const roleId = await roleWith(
    app,
    school,
    `Probe role ${roleCounter}`,
    permissions,
  );
  const someone = await person(app, { memberOf: [school] });
  await app
    .get(DataSource)
    .query(
      'INSERT INTO model_has_roles (user_id, role_id, school_id) VALUES ($1, $2, $3)',
      [someone.user.id, roleId, school.id],
    );
  return someone;
}

// A campus role holding exactly these permissions.
export async function roleWith(
  app: INestApplication,
  school: School,
  name: string,
  permissions: string[],
): Promise<string> {
  const dataSource = app.get(DataSource);
  const [{ id }] = await dataSource.query(
    'INSERT INTO roles (name, school_id) VALUES ($1, $2) RETURNING id',
    [name, school.id],
  );
  await dataSource.query(
    'INSERT INTO role_has_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE name = ANY($2::varchar[])',
    [id, permissions],
  );
  return id;
}

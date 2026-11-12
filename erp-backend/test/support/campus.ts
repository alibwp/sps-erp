import type { INestApplication } from '@nestjs/common';
import type { Test } from 'supertest';
import { DataSource, IsNull } from 'typeorm';
import { Role } from '../../src/access/entities/role.entity.js';
import { AuditEvent } from '../../src/audit/audit-event.entity.js';
import type { User } from '../../src/identity/entities/user.entity.js';
import { OrganizationMembership } from '../../src/organizations/entities/organization-membership.entity.js';
import { Organization } from '../../src/organizations/entities/organization.entity.js';
import { SchoolMembership } from '../../src/organizations/entities/school-membership.entity.js';
import { SchoolOperatingProfile } from '../../src/organizations/entities/school-operating-profile.entity.js';
import { School } from '../../src/organizations/entities/school.entity.js';
import { type Api, api, bearer, createUser, signIn } from './identity.js';

let counter = 0;
const next = () => {
  counter += 1;
  return `${counter}-${Date.now().toString(36)}`;
};

export async function createOrganization(
  app: INestApplication,
  fields: Partial<Organization> = {},
): Promise<Organization> {
  const manager = app.get(DataSource).manager;
  const n = next();
  return manager.save(
    manager.create(Organization, {
      name: `Organization ${n}`,
      code: `ORG-${n}`.toUpperCase(),
      ...fields,
    }),
  );
}

export async function createSchool(
  app: INestApplication,
  organization: Organization,
  fields: Partial<School> = {},
): Promise<School> {
  const manager = app.get(DataSource).manager;
  const n = next();
  const school = await manager.save(
    manager.create(School, {
      organizationId: organization.id,
      name: `Campus ${n}`,
      code: `C${n}`.toUpperCase(),
      timezone: 'UTC',
      ...fields,
    }),
  );
  await manager.save(
    manager.create(SchoolOperatingProfile, {
      schoolId: school.id,
      preset: 'home_sections',
      labels: {
        academic_year: 'Academic year',
        class_level: 'Class',
        section: 'Section',
        period: 'Term',
        course: 'Subject',
        fee: 'School fees',
        homeroom_teacher: 'Class teacher',
      },
    }),
  );
  return school;
}

export async function addMember(
  app: INestApplication,
  user: User,
  school: School,
  fields: Partial<SchoolMembership> = {},
): Promise<SchoolMembership> {
  const manager = app.get(DataSource).manager;
  return manager.save(
    manager.create(SchoolMembership, {
      userId: user.id,
      schoolId: school.id,
      status: 'active',
      joinedAt: new Date(),
      ...fields,
    }),
  );
}

export async function sharedRole(
  app: INestApplication,
  name: string,
): Promise<Role> {
  return app
    .get(DataSource)
    .manager.findOneOrFail(Role, { where: { name, schoolId: IsNull() } });
}

// Gives a role directly (no rules), by shared role name or role entity.
// school null: a global role.
export async function giveRole(
  app: INestApplication,
  user: User,
  role: string | Role,
  school: School | null,
): Promise<void> {
  const target = typeof role === 'string' ? await sharedRole(app, role) : role;
  await app
    .get(DataSource)
    .query(
      'INSERT INTO model_has_roles (user_id, role_id, school_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [user.id, target.id, school?.id ?? null],
    );
}

export async function makeOrganizationMember(
  app: INestApplication,
  user: User,
  organization: Organization,
  permissions: string[] | null = null,
): Promise<OrganizationMembership> {
  await giveRole(app, user, 'organization-admin', null);
  const manager = app.get(DataSource).manager;
  return manager.save(
    manager.create(OrganizationMembership, {
      organizationId: organization.id,
      userId: user.id,
      status: 'active',
      permissions,
      joinedAt: new Date(),
    }),
  );
}

export interface Person {
  user: User;
  token: string;
  client: Api;
  // Requests as this person; with a campus, X-School-Id names it.
  as(school?: School | string | null): Requests;
}

export interface Requests {
  get(path: string): Test;
  post(path: string): Test;
  put(path: string): Test;
  patch(path: string): Test;
  delete(path: string): Test;
}

export interface PersonSetup {
  fields?: Partial<User>;
  // Campuses the person is an active member of.
  memberOf?: School[];
  // [role name, campus] pairs; campus null for a global role.
  roles?: Array<[string, School | null]>;
}

// A signed-in person with memberships and roles.
export async function person(
  app: INestApplication,
  setup: PersonSetup = {},
): Promise<Person> {
  const user = await createUser(app, setup.fields ?? {});
  for (const school of setup.memberOf ?? []) await addMember(app, user, school);
  for (const [role, school] of setup.roles ?? []) {
    await giveRole(app, user, role, school);
  }
  const { accessToken, client } = await signIn(app, user.email);
  return {
    user,
    token: accessToken,
    client,
    as: (school) => {
      const schoolId = typeof school === 'string' ? school : school?.id;
      const wrap = (test: Test) => {
        test.set('Authorization', bearer(accessToken));
        if (schoolId) test.set('X-School-Id', schoolId);
        return test;
      };
      return {
        get: (path) => wrap(client.get(path)),
        post: (path) => wrap(client.post(path)),
        put: (path) => wrap(client.put(path)),
        patch: (path) => wrap(client.patch(path)),
        delete: (path) => wrap(client.delete(path)),
      };
    },
  };
}

// A campus admin: member of the campus with the built-in admin role there.
export function campusAdmin(
  app: INestApplication,
  school: School,
  fields: Partial<User> = {},
): Promise<Person> {
  return person(app, {
    fields,
    memberOf: [school],
    roles: [['admin', school]],
  });
}

export function platformAdmin(
  app: INestApplication,
  fields: Partial<User> = {},
): Promise<Person> {
  return person(app, { fields, roles: [['platform-admin', null]] });
}

export async function auditEvents(
  app: INestApplication,
  action: string,
  subjectId?: string,
): Promise<AuditEvent[]> {
  return app.get(DataSource).manager.find(AuditEvent, {
    where: { action, ...(subjectId ? { subjectId } : {}) },
    order: { createdAt: 'ASC' },
  });
}

export { api };

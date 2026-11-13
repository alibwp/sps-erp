import type { INestApplicationContext } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { BuiltInRole } from '../access/access.constants.js';
import { Role } from '../access/entities/role.entity.js';
import { RoleAssignments } from '../access/role-assignments.service.js';
import { RoleAuthority } from '../access/role-authority.service.js';
import { AcademicCalendar } from '../academic/academic-calendar.service.js';
import { isFrozen } from '../academic/academic.constants.js';
import { AcademicPeriod } from '../academic/entities/academic-period.entity.js';
import { AcademicYear } from '../academic/entities/academic-year.entity.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { ApiException } from '../common/errors/api-exception.js';
import { AcademicLevels } from '../curriculum/academic-levels.service.js';
import { CycleSections } from '../curriculum/cycle-sections.service.js';
import { AcademicCycleSection } from '../curriculum/entities/academic-cycle-section.entity.js';
import { AcademicLevel } from '../curriculum/entities/academic-level.entity.js';
import { holdsRoleHere } from '../enrollments/learners.js';
import { Students } from '../enrollments/students.service.js';
import { SessionService } from '../identity/auth/session.service.js';
import { CliError } from '../identity/cli/create-platform-admin.js';
import { User } from '../identity/entities/user.entity.js';
import {
  AUDIT_SUBJECT,
  InvitationService,
} from '../identity/invitations/invitation.service.js';
import { PasswordHasher } from '../identity/password-hasher.js';
import { Campuses } from '../organizations/campuses.service.js';
import { Organization } from '../organizations/entities/organization.entity.js';
import { School } from '../organizations/entities/school.entity.js';
import { OrganizationMembers } from '../organizations/organization-members.service.js';
import { Organizations } from '../organizations/organizations.service.js';
import { SchoolMemberships } from '../organizations/school-memberships.service.js';

// `seed-demo-users --password <password>`: one ready-made sign-in per role,
// all with the given password, so the team can try the app without setting
// accounts up. Typed by someone on the server; it never runs on its own.
// Running it again creates what is missing and puts every demo account
// back to signing in with email and password only. `--remove` archives
// them all and ends their sessions.

export const DEMO_ORGANIZATION = 'SPS';
export const DEMO_CAMPUS = 'Main Campus';
export const DEMO_TIME_ZONE = 'Asia/Karachi';
export const DEMO_LEVEL = 'Class 1';
export const DEMO_SECTION = 'A';

type DemoAccess = 'platform' | 'organization' | 'campus' | 'student';

export const DEMO_ACCOUNTS: ReadonlyArray<{
  email: string;
  name: string;
  access: DemoAccess;
  role?: string;
}> = [
  {
    email: 'platformadministrator@gmail.com',
    name: 'Platform Administrator',
    access: 'platform',
  },
  {
    email: 'organizationadministrator@gmail.com',
    name: 'Organization Administrator',
    access: 'organization',
  },
  {
    email: 'schooladministrator@gmail.com',
    name: 'School Administrator',
    access: 'campus',
    role: BuiltInRole.Admin,
  },
  {
    email: 'teacher@gmail.com',
    name: 'Teacher',
    access: 'campus',
    role: BuiltInRole.Teacher,
  },
  {
    email: 'accountant@gmail.com',
    name: 'Accountant',
    access: 'campus',
    role: 'accountant',
  },
  {
    email: 'librarian@gmail.com',
    name: 'Librarian',
    access: 'campus',
    role: 'librarian',
  },
  { email: 'student@gmail.com', name: 'Student', access: 'student' },
];

// The sign-in rule for new passwords (NewPasswordDto).
const PASSWORD_MIN_LENGTH = 8;

export interface SeededDemo {
  organizationId: string;
  schoolId: string;
  accounts: Array<{ email: string; name: string; created: boolean }>;
}

export async function seedDemoUsers(
  app: INestApplicationContext,
  input: { password?: string },
): Promise<SeededDemo> {
  const password = input.password ?? '';
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new CliError(
      `--password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    );
  }
  return asCliError(async () => {
    await refuseOtherAccounts(app);
    const school = await demoCampus(app);
    const passwordHash = await app.get(PasswordHasher).hash(password);
    const accounts = await app.get(TransactionService).run(async (tx) => {
      const manager = tx.manager;
      // Two runs at once: the second waits, then finds everything made.
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtext('sps-erp:demo-users'))`,
      );
      const seeded: Array<{ user: User; created: boolean }> = [];
      for (const account of DEMO_ACCOUNTS) {
        const result = await signInOnly(app, manager, account, passwordHash);
        await giveAccess(app, manager, school, result.user, account);
        seeded.push(result);
      }
      return seeded;
    });
    const student = accounts.find(({ user }) =>
      DEMO_ACCOUNTS.some(
        (account) =>
          account.access === 'student' && account.email === user.email,
      ),
    );
    if (student) await admitStudent(app, school, student.user);
    return {
      organizationId: school.organizationId,
      schoolId: school.id,
      accounts: accounts.map(({ user, created }) => ({
        email: user.email,
        name: user.name,
        created,
      })),
    };
  });
}

// Archives every demo account and ends its sessions; returns how many.
export async function removeDemoUsers(
  app: INestApplicationContext,
): Promise<number> {
  const sessions = app.get(SessionService);
  const invitations = app.get(InvitationService);
  const audit = app.get(AuditService);
  return app.get(TransactionService).run(async (tx) => {
    const manager = tx.manager;
    const users = await manager.find(User, {
      where: { demoAccount: true },
      withDeleted: true,
      order: { email: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    for (const user of users) {
      await sessions.revokeAllForUser(manager, user.id);
      await invitations.revokeIn(manager, user, null);
      const from = user.accountStatus;
      if (from === 'archived') continue;
      user.accountStatus = 'archived';
      await manager.save(user);
      await audit.record(manager, {
        action: AuditAction.AccountStatusChanged,
        subject: { type: AUDIT_SUBJECT.user, id: user.id },
        context: { from, to: 'archived', reason: 'Demo accounts removed' },
        schoolId: null,
        actorId: null,
      });
    }
    return users.length;
  });
}

// A real person may already use one of the addresses; their account is
// never taken over.
async function refuseOtherAccounts(
  app: INestApplicationContext,
): Promise<void> {
  const taken = (await app.get(DataSource).query(
    `SELECT email FROM users WHERE NOT demo_account AND email = ANY($1::text[])
      ORDER BY email`,
    [DEMO_ACCOUNTS.map((account) => account.email)],
  )) as Array<{ email: string }>;
  if (taken.length) {
    throw new CliError(
      `These addresses belong to accounts that are not demo accounts: ${taken
        .map((row) => row.email)
        .join(', ')}. Nothing was changed.`,
    );
  }
}

// The campus named Main Campus; on a database with no organization or
// campus yet, the organization SPS and that campus are made first, as
// install does.
async function demoCampus(app: INestApplicationContext): Promise<School> {
  return app.get(TransactionService).run(async (tx) => {
    const manager = tx.manager;
    await manager.query(
      `SELECT pg_advisory_xact_lock(hashtext('sps-erp:install'))`,
    );
    const named = await manager.find(School, {
      where: { name: DEMO_CAMPUS },
    });
    if (named.length === 1) return named[0];
    if (named.length > 1) {
      throw new CliError(
        `More than one campus is named "${DEMO_CAMPUS}". Nothing was changed.`,
      );
    }
    if (
      (await manager.exists(Organization)) ||
      (await manager.exists(School))
    ) {
      throw new CliError(
        `No campus is named "${DEMO_CAMPUS}". Rename the campus for the demo accounts, or run this on an empty database.`,
      );
    }
    const organization = await app.get(Organizations).createIn(
      manager,
      {
        name: DEMO_ORGANIZATION,
        code: null,
        address: null,
        email: null,
        phone: null,
      },
      null,
    );
    return app
      .get(Campuses)
      .openIn(
        manager,
        organization.id,
        { name: DEMO_CAMPUS, timezone: DEMO_TIME_ZONE },
        null,
      );
  });
}

// Creates the account or puts it back: active, the given password, email
// verified, no forced password change, no two-factor, no pending
// invitation.
async function signInOnly(
  app: INestApplicationContext,
  manager: EntityManager,
  account: (typeof DEMO_ACCOUNTS)[number],
  passwordHash: string,
): Promise<{ user: User; created: boolean }> {
  const existing = await manager.findOne(User, {
    where: { email: account.email },
    withDeleted: true,
    lock: { mode: 'pessimistic_write' },
  });
  if (existing && !existing.demoAccount) {
    throw new CliError(
      `${account.email} belongs to an account that is not a demo account. Nothing was changed.`,
    );
  }
  if (existing?.deletedAt) {
    await manager.restore(User, { id: existing.id });
    existing.deletedAt = null;
  }
  const user =
    existing ??
    manager.create(User, {
      email: account.email,
      name: account.name,
      demoAccount: true,
    });
  user.passwordHash = passwordHash;
  user.accountStatus = 'active';
  user.emailVerifiedAt ??= app.get(Clock).now();
  user.passwordChangeRequiredAt = null;
  user.twoFactorSecret = null;
  user.twoFactorRecoveryCodes = null;
  user.twoFactorConfirmedAt = null;
  user.twoFactorLastTimeStep = null;
  const saved = await manager.save(user);
  await app.get(InvitationService).revokeIn(manager, saved, null);
  return { user: saved, created: !existing };
}

async function giveAccess(
  app: INestApplicationContext,
  manager: EntityManager,
  school: School,
  user: User,
  account: (typeof DEMO_ACCOUNTS)[number],
): Promise<void> {
  const roles = app.get(RoleAssignments);
  const memberships = app.get(SchoolMemberships);
  switch (account.access) {
    case 'platform':
      await roles.grantGlobal(
        manager,
        user.id,
        BuiltInRole.PlatformAdmin,
        null,
      );
      return;
    case 'organization':
      await app
        .get(OrganizationMembers)
        .grantAllIn(manager, school.organizationId, user.id);
      await memberships.grant(manager, user.id, school.id);
      return;
    case 'campus':
      await memberships.grant(manager, user.id, school.id);
      await roles.give(manager, {
        person: user,
        role: await campusRole(app, manager, school.id, account.role!),
        schoolId: school.id,
        actorId: null,
      });
      return;
    case 'student':
      // The admission below gives the student role; the membership comes
      // first so the campus knows the account.
      await memberships.grant(manager, user.id, school.id);
      return;
  }
}

// The campus's own version of a shared role when it has tailored one.
async function campusRole(
  app: INestApplicationContext,
  manager: EntityManager,
  schoolId: string,
  name: string,
): Promise<Role> {
  const authority = app.get(RoleAuthority);
  const shared = await authority.sharedRole(manager, name);
  if (!shared) throw new Error(`The ${name} role is missing.`);
  return (await authority.tailoredCopyOf(manager, shared, schoolId)) ?? shared;
}

// A real admission through the admission service, into section A of
// Class 1 in the school year covering campus today; only what is missing
// is made.
async function admitStudent(
  app: INestApplicationContext,
  school: School,
  user: User,
): Promise<void> {
  const manager = app.get(DataSource).manager;
  if (await holdsRoleHere(manager, user.id, school.id, BuiltInRole.Student)) {
    return;
  }
  const { year, period } = await schoolYear(app, school);
  const level = await classOne(app, school);
  const section = await sectionA(app, school, year, level);
  await app
    .get(Students)
    .admit(
      null,
      school.id,
      { academicYear: year, academicPeriod: period, source: null, error: null },
      {
        name: user.name,
        email: user.email,
        academicCycleSectionId: section.id,
      },
    );
}

// The published school year covering campus today. When there is none, a
// year from 1 August to 31 July with two terms is made and published.
async function schoolYear(
  app: INestApplicationContext,
  school: School,
): Promise<{ year: AcademicYear; period: AcademicPeriod | null }> {
  const manager = app.get(DataSource).manager;
  const calendar = app.get(AcademicCalendar);
  const today = app.get(Clock).schoolToday(school.timezone);
  const covering = () =>
    manager
      .createQueryBuilder(AcademicYear, 'year')
      .where('year.schoolId = :schoolId', { schoolId: school.id })
      .andWhere('year.startsOn <= :today AND year.endsOn >= :today', { today })
      .getOne();

  let year = await covering();
  if (!year) {
    const [y, month] = today.split('-').map(Number);
    const start = month >= 8 ? y : y - 1;
    const created = await calendar.save(school.id, {
      startsOn: `${start}-08-01`,
      endsOn: `${start + 1}-07-31`,
      periods: [
        {
          name: 'First term',
          type: 'term',
          startsOn: `${start}-08-01`,
          endsOn: `${start}-12-31`,
        },
        {
          name: 'Second term',
          type: 'term',
          startsOn: `${start + 1}-01-01`,
          endsOn: `${start + 1}-07-31`,
        },
      ],
    });
    year = await calendar.publish(school.id, created.id);
  } else if (year.status === 'draft') {
    year = await calendar.publish(school.id, year.id);
  } else if (isFrozen(year.status)) {
    throw new CliError(
      'The school year covering today is closed, so the demo student cannot be admitted.',
    );
  }
  const period = await manager
    .createQueryBuilder(AcademicPeriod, 'period')
    .where('period.academicYearId = :yearId', { yearId: year.id })
    .andWhere('period.parentId IS NULL')
    .andWhere('period.startsOn <= :today AND period.endsOn >= :today', {
      today,
    })
    .getOne();
  return { year, period };
}

async function classOne(
  app: INestApplicationContext,
  school: School,
): Promise<AcademicLevel> {
  const levels = app.get(AcademicLevels);
  const level = await app
    .get(DataSource)
    .manager.createQueryBuilder(AcademicLevel, 'level')
    .where('level.schoolId = :schoolId', { schoolId: school.id })
    .andWhere('level.isGroup = false')
    .andWhere('lower(level.name) = lower(:name)', { name: DEMO_LEVEL })
    .orderBy('level.createdAt')
    .getOne();
  if (!level) return levels.create(school.id, { name: DEMO_LEVEL });
  if (level.status === 'draft') {
    return levels.changeStatus(school.id, level.id, 'active');
  }
  if (level.status === 'archived') {
    throw new CliError(
      `The level "${level.name}" is archived, so the demo student cannot be admitted.`,
    );
  }
  return level;
}

async function sectionA(
  app: INestApplicationContext,
  school: School,
  year: AcademicYear,
  level: AcademicLevel,
): Promise<AcademicCycleSection> {
  const sections = app.get(CycleSections);
  let section = await app
    .get(DataSource)
    .manager.createQueryBuilder(AcademicCycleSection, 'section')
    .where('section.schoolId = :schoolId', { schoolId: school.id })
    .andWhere('section.academicYearId = :yearId', { yearId: year.id })
    .andWhere('section.academicLevelId = :levelId', { levelId: level.id })
    .andWhere('lower(section.name) = lower(:name)', { name: DEMO_SECTION })
    .getOne();
  section ??= await sections.create(school.id, year.id, level.id, {
    name: DEMO_SECTION,
  });
  if (section.status === 'draft') {
    return sections.changeStatus(school.id, section.id, 'active');
  }
  if (section.status === 'archived') {
    throw new CliError(
      `Section "${section.name}" of ${level.name} is archived, so the demo student cannot be admitted.`,
    );
  }
  return section;
}

// A rule the application refuses on (an overlapping school year, a full
// section) is printed as the command's error.
async function asCliError<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApiException) {
      const details = Object.values(error.fields ?? {}).flat();
      throw new CliError([error.message, ...details].join(' '));
    }
    throw error;
  }
}

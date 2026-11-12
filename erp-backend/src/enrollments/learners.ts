import type { EntityManager } from 'typeorm';

// Questions about a person the enrollment rules ask (reference User).

// Holds a staff role (anything but student or parent) at a campus where
// they are an active member (User::worksAsStaff).
export async function worksAsStaff(
  manager: EntityManager,
  userId: string,
): Promise<boolean> {
  const [row] = (await manager.query(
    `SELECT EXISTS (
       SELECT 1 FROM model_has_roles a
         JOIN roles r ON r.id = a.role_id
         JOIN school_memberships m
           ON m.user_id = a.user_id AND m.school_id = a.school_id AND m.status = 'active'
        WHERE a.user_id = $1 AND r.name NOT IN ('student', 'parent')
     ) AS staff`,
    [userId],
  )) as Array<{ staff: boolean }>;
  return row.staff;
}

// An active member of the campus holding the named role there
// (UserService::failIfAlreadyHolds).
export async function holdsRoleHere(
  manager: EntityManager,
  userId: string,
  schoolId: string,
  roleName: string,
): Promise<boolean> {
  const [row] = (await manager.query(
    `SELECT EXISTS (
       SELECT 1 FROM model_has_roles a
         JOIN roles r ON r.id = a.role_id AND r.name = $3
                     AND (r.school_id IS NULL OR r.school_id = $2)
         JOIN school_memberships m
           ON m.user_id = a.user_id AND m.school_id = $2 AND m.status = 'active'
        WHERE a.user_id = $1 AND a.school_id = $2
     ) AS holds`,
    [userId, schoolId, roleName],
  )) as Array<{ holds: boolean }>;
  return row.holds;
}

// An open (active or suspended) enrollment at another campus.
export async function openEnrollmentElsewhere(
  manager: EntityManager,
  userId: string,
  schoolId: string,
): Promise<{ schoolName: string; organizationId: string } | null> {
  const [row] = (await manager.query(
    `SELECT s.name AS school_name, s.organization_id
       FROM student_records sr JOIN schools s ON s.id = sr.school_id
      WHERE sr.user_id = $1 AND sr.school_id <> $2
        AND sr.status IN ('active', 'suspended')
      LIMIT 1`,
    [userId, schoolId],
  )) as Array<{ school_name: string; organization_id: string }>;
  return row
    ? { schoolName: row.school_name, organizationId: row.organization_id }
    : null;
}

// Enrolled at another campus and not at this one
// (User::isEnrolledOnlyElsewhere).
export async function isEnrolledOnlyElsewhere(
  manager: EntityManager,
  userId: string,
  schoolId: string,
): Promise<boolean> {
  const [row] = (await manager.query(
    `SELECT
       EXISTS (SELECT 1 FROM student_records
                WHERE user_id = $1 AND school_id <> $2 AND status IN ('active', 'suspended')) AS elsewhere,
       EXISTS (SELECT 1 FROM student_records
                WHERE user_id = $1 AND school_id = $2 AND status IN ('active', 'suspended')) AS here`,
    [userId, schoolId],
  )) as Array<{ elsewhere: boolean; here: boolean }>;
  return row.elsewhere && !row.here;
}

// Has an open enrollment anywhere.
export async function isEnrolledLearner(
  manager: EntityManager,
  userId: string,
): Promise<boolean> {
  const [row] = (await manager.query(
    `SELECT EXISTS (SELECT 1 FROM student_records
                     WHERE user_id = $1 AND status IN ('active', 'suspended')) AS enrolled`,
    [userId],
  )) as Array<{ enrolled: boolean }>;
  return row.enrolled;
}

// Still an active member of another campus (User::belongsToAnotherSchool).
export async function belongsToAnotherSchool(
  manager: EntityManager,
  userId: string,
  schoolId: string,
): Promise<boolean> {
  const [row] = (await manager.query(
    `SELECT EXISTS (SELECT 1 FROM school_memberships
                     WHERE user_id = $1 AND school_id <> $2 AND status = 'active') AS other`,
    [userId, schoolId],
  )) as Array<{ other: boolean }>;
  return row.other;
}

// "15 Nov 2026" (Carbon's j M Y).
export function shortDay(day: string): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const [year, month, date] = day.split('-').map(Number);
  return `${date} ${months[month - 1]} ${year}`;
}

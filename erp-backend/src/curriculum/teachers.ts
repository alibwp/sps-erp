import type { EntityManager } from 'typeorm';

export interface TeacherStanding {
  // An active member of the campus.
  worksHere: boolean;
  // Holds the teacher role at the campus (the shared role or the campus's
  // own copy of it).
  isTeacher: boolean;
}

// Reference User::belongsToSchool and hasRole('teacher') for one campus.
export async function teacherStanding(
  manager: EntityManager,
  schoolId: string,
  userId: string,
): Promise<TeacherStanding> {
  const [row] = (await manager.query(
    `SELECT
       EXISTS (
         SELECT 1 FROM school_memberships m
          WHERE m.user_id = $1 AND m.school_id = $2 AND m.status = 'active'
       ) AS works_here,
       EXISTS (
         SELECT 1 FROM model_has_roles a
           JOIN roles r ON r.id = a.role_id AND r.name = 'teacher'
                       AND (r.school_id IS NULL OR r.school_id = $2)
          WHERE a.user_id = $1 AND a.school_id = $2
       ) AS is_teacher`,
    [userId, schoolId],
  )) as Array<{ works_here: boolean; is_teacher: boolean }>;
  return { worksHere: row.works_here, isTeacher: row.is_teacher };
}

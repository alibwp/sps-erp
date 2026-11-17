import type { EntityManager } from 'typeorm';
import { FAMILY_ROLES } from './access.constants.js';

// True when every role the person holds at the campus (or globally) is a
// family portal role (student, parent). Such people read the calendar and
// notices through the portal (reference isPortalOnly), not the campus
// pages. Someone with no role at all is not portal-only.
export async function isPortalOnly(
  manager: EntityManager,
  userId: string,
  schoolId: string,
): Promise<boolean> {
  const [row] = (await manager.query(
    `SELECT count(*) > 0 AND bool_and(r.name = ANY($3::varchar[])) AS portal_only
       FROM model_has_roles a JOIN roles r ON r.id = a.role_id
      WHERE a.user_id = $1 AND (a.school_id = $2 OR a.school_id IS NULL)`,
    [userId, schoolId, FAMILY_ROLES],
  )) as Array<{ portal_only: boolean }>;
  return row.portal_only;
}

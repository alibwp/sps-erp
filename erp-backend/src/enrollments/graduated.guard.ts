import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { ALLOW_GRADUATED } from '../access/access-context.js';
import { Forbidden } from '../access/access.constants.js';

export const GRADUATED_MESSAGE =
  'You cannot access this resource because you have been marked as graduated';

// Global guard 6 (reference PreventGraduatedStudent): a learner whose
// enrollment at the working campus is graduated may use only their own
// account and context there (routes marked @AllowGraduatedLearners()). The
// student role keeps permissions such as reading notices and timetables, so
// permissions alone would let them through.
@Injectable()
export class GraduatedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_GRADUATED, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.auth || !req.campus) return true;

    const [row] = (await this.dataSource.query(
      `SELECT EXISTS (
         SELECT 1 FROM model_has_roles a
           JOIN roles r ON r.id = a.role_id AND r.name = 'student'
          WHERE a.user_id = $1 AND a.school_id = $2
       ) AND EXISTS (
         SELECT 1 FROM student_records
          WHERE user_id = $1 AND school_id = $2 AND status = 'graduated'
       ) AND NOT EXISTS (
         SELECT 1 FROM student_records
          WHERE user_id = $1 AND school_id = $2 AND status IN ('active', 'suspended')
       ) AS graduated`,
      [req.auth.user.id, req.campus.school.id],
    )) as Array<{ graduated: boolean }>;
    if (row.graduated) throw new Forbidden(GRADUATED_MESSAGE);
    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  applyDecorators,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiHeader } from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import { CAMPUS_ROUTE } from '../access/access-context.js';
import { ValidationFailed } from '../common/errors/api-exception.js';
import { ACADEMIC_PERIOD_HEADER } from '../common/openapi/openapi.js';
import {
  AcademicPeriodContext,
  AcademicPeriodRequired,
  AcademicPeriodsOverlap,
  type WorkingPeriod,
} from './academic-period-context.service.js';

declare module 'express' {
  interface Request {
    academic?: WorkingPeriod;
  }
}

export const REQUIRE_ACADEMIC_PERIOD = 'academic:require-period';

export const academicPeriodHeader = () =>
  ApiHeader({
    name: ACADEMIC_PERIOD_HEADER,
    required: false,
    description:
      'Working academic period (UUID, a top-level period of a published year). When absent: your saved choice, then the period covering campus today, then the campus default.',
  });

// The route works in one academic period of the working campus. When none
// can be worked out it answers 409 academic_period_required; when two
// top-level periods cover campus today, 409 academic_periods_overlap.
export const RequireAcademicPeriod = () =>
  applyDecorators(
    SetMetadata(CAMPUS_ROUTE, true),
    SetMetadata(REQUIRE_ACADEMIC_PERIOD, true),
    academicPeriodHeader(),
  );

export const Working = createParamDecorator(
  (_data: unknown, context: ExecutionContext): WorkingPeriod => {
    const academic = context.switchToHttp().getRequest<Request>().academic;
    if (!academic) {
      throw new Error('Working used on a route without @RequireAcademicPeriod');
    }
    return academic;
  },
);

// The X-Academic-Period-Id header, when sent: 400 when it is not a UUID.
export function periodHeader(req: Request): string | undefined {
  const value = req.headers[ACADEMIC_PERIOD_HEADER.toLowerCase()];
  if (value === undefined) return undefined;
  const id = typeof value === 'string' ? value.trim() : '';
  if (!isUUID(id)) {
    throw new ValidationFailed({
      [ACADEMIC_PERIOD_HEADER]: [
        'X-Academic-Period-Id must be the id of an academic period.',
      ],
    });
  }
  return id;
}

// Global guard 5, after AccessGuard has checked the working campus.
@Injectable()
export class AcademicPeriodGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly context: AcademicPeriodContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_ACADEMIC_PERIOD,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.auth || !req.campus) return true;

    const working = await this.context.resolve(
      req.auth.user.id,
      req.campus.school,
      periodHeader(req),
    );
    if (working.error) throw new AcademicPeriodsOverlap(working.error);
    if (!working.academicPeriod) throw new AcademicPeriodRequired();
    req.academic = working;
    return true;
  }
}

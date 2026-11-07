import { HttpException, HttpStatus } from '@nestjs/common';

export type FieldErrors = Record<string, string[]>;

// An error whose code and message are sent to the client as they are.
// `code` is the stable, machine-readable value the frontend switches on.
export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly fields?: FieldErrors,
  ) {
    super(message, status);
  }
}

// 400: the request body or query failed validation.
export class ValidationFailed extends ApiException {
  constructor(fields: FieldErrors, message = 'The given data was invalid.') {
    super(HttpStatus.BAD_REQUEST, 'validation_failed', message, fields);
  }
}

// 422: a business rule refuses the action. Reuse the reference's wording.
export class RuleViolation extends ApiException {
  constructor(message: string, fields?: FieldErrors) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, 'rule_violation', message, fields);
  }
}

// 422: the academic or financial period the action touches is closed.
export class PeriodClosed extends ApiException {
  constructor(message: string) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, 'period_closed', message);
  }
}

// 409: a unique key race, a stale record or overlapping periods.
export class Conflict extends ApiException {
  constructor(message: string, code = 'conflict') {
    super(HttpStatus.CONFLICT, code, message);
  }
}

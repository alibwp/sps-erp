import { HttpException, HttpStatus } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ApiException, FieldErrors } from './api-exception.js';

export interface ErrorBody {
  error: { code: string; message: string; fields?: FieldErrors };
}

export interface ErrorResponse {
  status: number;
  body: ErrorBody;
}

// The code sent for a plain HttpException (one that is not an ApiException).
const CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'validation_failed',
  [HttpStatus.UNAUTHORIZED]: 'unauthenticated',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'method_not_allowed',
  [HttpStatus.CONFLICT]: 'conflict',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'payload_too_large',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'unsupported_media_type',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'rule_violation',
  [HttpStatus.TOO_MANY_REQUESTS]: 'too_many_requests',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'service_unavailable',
};

// PostgreSQL error codes that mean "another request got there first".
const PG_UNIQUE_VIOLATION = '23505';
export const PG_RETRYABLE_CODES = ['40001', '40P01']; // serialization, deadlock

const INTERNAL_MESSAGE = 'Something went wrong. Please try again later.';

export function postgresCode(exception: unknown): string | undefined {
  if (!(exception instanceof QueryFailedError)) return undefined;
  const code = (exception.driverError as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}

function httpExceptionMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  const message = (response as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join('; ');
  if (typeof message === 'string') return message;
  return exception.message;
}

// Turns any thrown value into the one error shape the API answers with:
// { "error": { "code", "message", "fields"? } }.
export function toErrorResponse(exception: unknown): ErrorResponse {
  if (exception instanceof ApiException) {
    const error: ErrorBody['error'] = {
      code: exception.code,
      message: exception.message,
    };
    if (exception.fields) error.fields = exception.fields;
    return { status: exception.getStatus(), body: { error } };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code =
      CODE_BY_STATUS[status] ?? (status >= 500 ? 'internal_error' : 'error');
    const message =
      status >= 500 && status !== HttpStatus.SERVICE_UNAVAILABLE
        ? INTERNAL_MESSAGE
        : httpExceptionMessage(exception);
    return { status, body: { error: { code, message } } };
  }

  const pgCode = postgresCode(exception);
  if (pgCode === PG_UNIQUE_VIOLATION) {
    return {
      status: HttpStatus.CONFLICT,
      body: {
        error: {
          code: 'conflict',
          message: 'This record already exists or was just changed.',
        },
      },
    };
  }
  if (pgCode && PG_RETRYABLE_CODES.includes(pgCode)) {
    return {
      status: HttpStatus.CONFLICT,
      body: {
        error: {
          code: 'conflict',
          message: 'Another change was saved at the same time. Please retry.',
        },
      },
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { error: { code: 'internal_error', message: INTERNAL_MESSAGE } },
  };
}

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { QueryFailedError } from 'typeorm';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import {
  Conflict,
  PeriodClosed,
  RuleViolation,
  ValidationFailed,
} from './api-exception.js';
import { toErrorResponse } from './error-response.js';

const pgError = (code: string) =>
  new QueryFailedError(
    'INSERT ...',
    [],
    Object.assign(new Error('pg'), { code }),
  );

describe('toErrorResponse', () => {
  it.each([
    [
      'ValidationFailed',
      new ValidationFailed({ email: ['email must be an email'] }),
      400,
      'validation_failed',
    ],
    [
      'BadRequestException',
      new BadRequestException('Unexpected token'),
      400,
      'validation_failed',
    ],
    [
      'UnauthorizedException',
      new UnauthorizedException(),
      401,
      'unauthenticated',
    ],
    [
      'ForbiddenException',
      new ForbiddenException('No permission'),
      403,
      'forbidden',
    ],
    [
      'NotFoundException',
      new NotFoundException('Cannot GET /api/nope'),
      404,
      'not_found',
    ],
    ['Conflict', new Conflict('Overlapping period'), 409, 'conflict'],
    [
      'RuleViolation',
      new RuleViolation('The year is closed for changes.'),
      422,
      'rule_violation',
    ],
    [
      'PeriodClosed',
      new PeriodClosed('This period is closed.'),
      422,
      'period_closed',
    ],
    ['ThrottlerException', new ThrottlerException(), 429, 'too_many_requests'],
  ])('maps %s to %i %s', (_name, exception, status, code) => {
    const response = toErrorResponse(exception);
    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(typeof response.body.error.message).toBe('string');
  });

  it('keeps the message and field list of validation errors', () => {
    expect(
      toErrorResponse(
        new ValidationFailed({ email: ['email must be an email'] }),
      ),
    ).toEqual({
      status: 400,
      body: {
        error: {
          code: 'validation_failed',
          message: 'The given data was invalid.',
          fields: { email: ['email must be an email'] },
        },
      },
    });
  });

  it('sends the rule message unchanged and omits fields when there are none', () => {
    const { body } = toErrorResponse(
      new RuleViolation('The year is closed for changes.'),
    );
    expect(body).toEqual({
      error: {
        code: 'rule_violation',
        message: 'The year is closed for changes.',
      },
    });
  });

  it('allows a specific code on a conflict', () => {
    const { status, body } = toErrorResponse(
      new Conflict('Pick one', 'academic_period_required'),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe('academic_period_required');
  });

  it('joins the message list of a plain HttpException', () => {
    const { body } = toErrorResponse(
      new BadRequestException(['a is wrong', 'b is wrong']),
    );
    expect(body.error.message).toBe('a is wrong; b is wrong');
  });

  it('maps a unique key violation to 409 conflict', () => {
    expect(toErrorResponse(pgError('23505'))).toMatchObject({
      status: 409,
      body: { error: { code: 'conflict' } },
    });
  });

  it.each(['40001', '40P01'])(
    'maps PostgreSQL %s (retry exhausted) to 409',
    (code) => {
      expect(toErrorResponse(pgError(code)).status).toBe(409);
    },
  );

  it('hides the details of unexpected errors behind a 500', () => {
    for (const exception of [
      new Error('password=secret in connection string'),
      pgError('42P01'),
      new InternalServerErrorException('stack details'),
      'thrown string',
    ]) {
      const { status, body } = toErrorResponse(exception);
      expect(status).toBe(500);
      expect(body.error.code).toBe('internal_error');
      expect(body.error.message).not.toMatch(/secret|stack|42P01|thrown/);
    }
  });

  it('gives other client errors a generic code', () => {
    expect(
      toErrorResponse(new HttpException('Gone', 410)).body.error.code,
    ).toBe('error');
  });
});

describe('AllExceptionsFilter', () => {
  const hostFor = (response: object) =>
    ({ switchToHttp: () => ({ getResponse: () => response }) }) as never;

  it('writes the status and the error body', () => {
    const json = vi.fn();
    const response = { headersSent: false, status: vi.fn(() => ({ json })) };

    new AllExceptionsFilter().catch(
      new RuleViolation('Nope.'),
      hostFor(response),
    );

    expect(response.status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'rule_violation', message: 'Nope.' },
    });
  });

  it('does nothing when the response was already sent', () => {
    const response = { headersSent: true, status: vi.fn() };
    new AllExceptionsFilter().catch(new NotFoundException(), hostFor(response));
    expect(response.status).not.toHaveBeenCalled();
  });
});

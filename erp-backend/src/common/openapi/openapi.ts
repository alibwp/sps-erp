import { HttpStatus, INestApplication, applyDecorators } from '@nestjs/common';
import {
  ApiHeader,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';

export const SCHOOL_HEADER = 'X-School-Id';
export const ACADEMIC_PERIOD_HEADER = 'X-Academic-Period-Id';
export const OPENAPI_PATH = 'api/docs';
export const OPENAPI_JSON_PATH = 'api/docs/openapi.json';

class ErrorDetailDto {
  @ApiProperty({ example: 'rule_violation' })
  code: string;

  @ApiProperty({ example: 'The given data was invalid.' })
  message: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
    example: { email: ['email must be an email'] },
  })
  fields?: Record<string, string[]>;
}

// The one error shape every endpoint answers with.
export class ErrorResponseDto {
  @ApiProperty({ type: ErrorDetailDto })
  error: ErrorDetailDto;
}

const ERROR_DESCRIPTIONS: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]: 'validation_failed: the body or query is invalid',
  [HttpStatus.UNAUTHORIZED]:
    'unauthenticated: missing, expired or revoked token; invalid_credentials: wrong email or password',
  [HttpStatus.FORBIDDEN]:
    'forbidden: a permission is missing, a policy refuses or the account is not active; password_change_required: choose a new password first (PUT /api/v1/me/password)',
  [HttpStatus.NOT_FOUND]:
    'not_found: unknown id, another campus record or a disabled feature',
  [HttpStatus.CONFLICT]: 'conflict: unique key race, stale record or overlap',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'rule_violation or period_closed',
  [HttpStatus.LOCKED]:
    'password_confirmation_required: confirm the password first (POST /api/v1/auth/confirm-password)',
  [HttpStatus.TOO_MANY_REQUESTS]: 'too_many_requests: rate limit reached',
  [HttpStatus.SERVICE_UNAVAILABLE]:
    'service_unavailable: background work cannot be queued right now',
};

// Documents the error responses an endpoint can give, in the error shape.
export function ApiErrorResponses(...statuses: HttpStatus[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: ERROR_DESCRIPTIONS[status] ?? 'Error',
        type: ErrorResponseDto,
      }),
    ),
  );
}

// For campus routes (from Stage 2): the working campus and, optionally, the
// academic period.
export function ApiCampusHeaders() {
  return applyDecorators(
    ApiHeader({
      name: SCHOOL_HEADER,
      required: true,
      description:
        'Working campus (UUID). Must match an active school membership.',
    }),
    ApiHeader({
      name: ACADEMIC_PERIOD_HEADER,
      required: false,
      description:
        'Academic period (UUID). When absent: saved preference, then the period covering campus today, then the campus default.',
    }),
  );
}

export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('SPS ERP API')
    .setDescription(
      'School management backend. Errors use the shape { "error": { "code", "message", "fields" } }.',
    )
    .setVersion('1')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorResponseDto],
  });
  document.components ??= {};
  document.components.parameters = {
    ...document.components.parameters,
    SchoolId: {
      name: SCHOOL_HEADER,
      in: 'header',
      required: true,
      schema: { type: 'string', format: 'uuid' },
      description: 'Working campus. Must match an active school membership.',
    },
    AcademicPeriodId: {
      name: ACADEMIC_PERIOD_HEADER,
      in: 'header',
      required: false,
      schema: { type: 'string', format: 'uuid' },
      description:
        'Working academic period; resolved by the server when absent.',
    },
  };

  SwaggerModule.setup(OPENAPI_PATH, app, document, {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
    yamlDocumentUrl: 'api/docs/openapi.yaml',
  });
}

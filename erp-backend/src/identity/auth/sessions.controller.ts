import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { TransactionService } from '../../common/database/transaction.service.js';
import { ApiErrorResponses } from '../../common/openapi/openapi.js';
import { AuthSession } from '../entities/auth-session.entity.js';
import { RevokedSessionsDto, SessionDto } from '../identity.dto.js';
import { PasswordConfirmationRequired } from '../identity.constants.js';
import { type AuthContext, CurrentAuth } from './auth-context.js';
import { SessionService } from './session.service.js';

@ApiTags('Auth')
@ApiBearerAuth('bearer')
@Controller('auth/sessions')
export class SessionsController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List your signed-in sessions' })
  @ApiOkResponse({ type: [SessionDto] })
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  list(@CurrentAuth() auth: AuthContext): Promise<SessionDto[]> {
    return this.sessions.list(auth.user.id, auth.session.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'End one of your sessions (the current one signs you out)',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  async revoke(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    // Another person's session answers 404, never revealing it exists.
    const owned = await this.dataSource.manager.exists(AuthSession, {
      where: { id, userId: auth.user.id },
    });
    if (!owned) throw new NotFoundException('Session not found.');
    await this.sessions.revoke(id);
  }

  @Post('revoke-others')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign out every other session',
    description:
      'Needs a password confirmation younger than 3 hours (POST /auth/confirm-password).',
  })
  @ApiOkResponse({ type: RevokedSessionsDto })
  @ApiErrorResponses(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.LOCKED,
  )
  async revokeOthers(
    @CurrentAuth() auth: AuthContext,
  ): Promise<RevokedSessionsDto> {
    if (!this.sessions.hasRecentPasswordConfirmation(auth.session)) {
      throw new PasswordConfirmationRequired();
    }
    const revoked = await this.transactions.run((tx) =>
      this.sessions.revokeAllForUser(tx.manager, auth.user.id, auth.session.id),
    );
    return { revoked };
  }
}

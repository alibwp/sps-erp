import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/openapi/openapi.js';
import { Public } from '../auth/auth-context.js';
import { AcceptInvitationDto, InvitationDto } from '../identity.dto.js';
import { Messages } from '../identity.constants.js';
import { InvitationService } from './invitation.service.js';

// The pages the invitation email opens. Sending invitations is done by
// administrators (Stage 2).
@ApiTags('Invitations')
@Public()
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationService) {}

  @Get(':token')
  @ApiOperation({ summary: 'The pending invitation a link points to' })
  @ApiOkResponse({ type: InvitationDto })
  @ApiErrorResponses(HttpStatus.NOT_FOUND, HttpStatus.TOO_MANY_REQUESTS)
  async show(@Param('token') token: string): Promise<InvitationDto> {
    const invitation = await this.invitations.findPending(token);
    if (!invitation) throw new NotFoundException(Messages.invalidInvitation);
    return {
      name: invitation.user.name,
      email: invitation.user.email,
      expiresAt: invitation.expiresAt,
    };
  }

  @Post(':token/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Set a password and activate the account',
    description:
      'The link works once. Sign in afterwards with POST /auth/login.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  async accept(
    @Param('token') token: string,
    @Body() body: AcceptInvitationDto,
  ): Promise<void> {
    await this.invitations.accept(token, body.password);
  }
}

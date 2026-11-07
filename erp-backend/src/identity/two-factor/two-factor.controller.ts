import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/openapi/openapi.js';
import { type AuthContext, CurrentAuth } from '../auth/auth-context.js';
import { SessionService } from '../auth/session.service.js';
import {
  RecoveryCodesDto,
  TwoFactorCodeDto,
  TwoFactorSetupDto,
  TwoFactorStatusDto,
} from '../identity.dto.js';
import { PasswordConfirmationRequired } from '../identity.constants.js';
import { TwoFactorService } from './two-factor.service.js';

const CONFIRMATION_NOTE =
  'Needs a password confirmation younger than 3 hours (POST /auth/confirm-password).';

@ApiTags('Two-factor')
@ApiBearerAuth('bearer')
@Controller('auth/two-factor')
export class TwoFactorController {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Two-factor status (never the secret or the codes)',
  })
  @ApiOkResponse({ type: TwoFactorStatusDto })
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  status(@CurrentAuth() auth: AuthContext): TwoFactorStatusDto {
    return this.twoFactor.status(auth.user);
  }

  @Post()
  @ApiOperation({
    summary: 'Start two-factor setup',
    description: `Returns the secret, its otpauth:// URL and the recovery codes, shown only now. Sign-in asks for a code once the setup is confirmed. ${CONFIRMATION_NOTE}`,
  })
  @ApiCreatedResponse({ type: TwoFactorSetupDto })
  @ApiErrorResponses(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.LOCKED,
  )
  enable(@CurrentAuth() auth: AuthContext): Promise<TwoFactorSetupDto> {
    this.requireConfirmation(auth);
    return this.twoFactor.enable(auth.user.id);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Confirm setup with a code from the authenticator app',
    description: CONFIRMATION_NOTE,
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.LOCKED,
  )
  async confirm(
    @CurrentAuth() auth: AuthContext,
    @Body() body: TwoFactorCodeDto,
  ): Promise<void> {
    this.requireConfirmation(auth);
    await this.twoFactor.confirm(auth.user.id, body.code);
  }

  @Post('recovery-codes')
  @ApiOperation({
    summary: 'Replace the recovery codes',
    description: `The old codes stop working; the new ones are shown only now. ${CONFIRMATION_NOTE}`,
  })
  @ApiCreatedResponse({ type: RecoveryCodesDto })
  @ApiErrorResponses(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.LOCKED,
  )
  async regenerate(
    @CurrentAuth() auth: AuthContext,
  ): Promise<RecoveryCodesDto> {
    this.requireConfirmation(auth);
    return {
      recoveryCodes: await this.twoFactor.regenerateRecoveryCodes(auth.user.id),
    };
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Turn two-factor off',
    description: CONFIRMATION_NOTE,
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.LOCKED,
  )
  async disable(@CurrentAuth() auth: AuthContext): Promise<void> {
    this.requireConfirmation(auth);
    await this.twoFactor.disable(auth.user.id);
  }

  // Fortify puts every two-factor route behind password.confirm.
  private requireConfirmation(auth: AuthContext): void {
    if (!this.sessions.hasRecentPasswordConfirmation(auth.session)) {
      throw new PasswordConfirmationRequired();
    }
  }
}

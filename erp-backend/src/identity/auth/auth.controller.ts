import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Clock } from '../../common/clock/clock.js';
import { ApiErrorResponses } from '../../common/openapi/openapi.js';
import { accessDeniedMessage } from '../account-status.js';
import { EmailVerificationService } from '../email-verification/email-verification.service.js';
import {
  AccessTokenDto,
  ConfirmPasswordDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
  TwoFactorChallengeDto,
  TwoFactorRequiredDto,
  VerifyEmailDto,
} from '../identity.dto.js';
import {
  AccountNotActive,
  Messages,
  Unauthenticated,
  normalizeEmail,
} from '../identity.constants.js';
import { PasswordHasher } from '../password-hasher.js';
import { PasswordResetService } from '../password-reset/password-reset.service.js';
import { RuleViolation } from '../../common/errors/api-exception.js';
// Refresh and logout are public, so the forced-password-change guard never
// stops them.
import {
  type AuthContext,
  Client,
  type ClientInfo,
  CurrentAuth,
  Public,
} from './auth-context.js';
import { AuthService } from './auth.service.js';
import {
  REFRESH_COOKIE,
  assertAllowedOrigin,
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie.js';
import { SessionService } from './session.service.js';
import { twoFactorTracker } from './two-factor-attempts.middleware.js';
import { ACCESS_TOKEN_SECONDS, TokenService } from './token.service.js';

const PER_MINUTE = 60_000;

function accessToken(token: string): AccessTokenDto {
  return {
    accessToken: token,
    tokenType: 'Bearer',
    expiresIn: ACCESS_TOKEN_SECONDS,
  };
}

// Reference limiters: login 5 a minute per email + IP, two-factor 5 a
// minute per account, verification emails 6 a minute (Fortify).
const loginTracker = (req: Record<string, any>) =>
  `login:${typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : ''}|${req.ip}`;
const verificationTracker = (req: Record<string, any>) =>
  `verification:${req.user?.id ?? req.ip}`;

@ApiTags('Auth')
@ApiExtraModels(AccessTokenDto, TwoFactorRequiredDto)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly config: ConfigService,
    private readonly clock: Clock,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly hasher: PasswordHasher,
    private readonly passwordResets: PasswordResetService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: 5, ttl: PER_MINUTE, getTracker: loginTracker },
  })
  @ApiOperation({
    summary: 'Sign in with email and password',
    description: `Sets the refresh token in the httpOnly cookie ${REFRESH_COOKIE}. With two-factor confirmed, answers twoFactorRequired and a challenge token instead.`,
  })
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(AccessTokenDto) },
        { $ref: getSchemaPath(TwoFactorRequiredDto) },
      ],
    },
  })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  async login(
    @Body() body: LoginDto,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenDto | TwoFactorRequiredDto> {
    const result = await this.auth.login(body.email, body.password, client);
    if (result.kind === 'two-factor') {
      return { twoFactorRequired: true, challengeToken: result.challengeToken };
    }
    setRefreshCookie(res, this.config, result.refreshToken, {
      expiresAt: result.expiresAt,
      now: this.clock.now(),
    });
    return accessToken(result.accessToken);
  }

  @Public()
  @Post('two-factor-challenge')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: 5, ttl: PER_MINUTE, getTracker: twoFactorTracker },
  })
  @ApiOperation({
    summary: 'Finish signing in with a two-factor code or a recovery code',
  })
  @ApiOkResponse({ type: AccessTokenDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  async twoFactorChallenge(
    @Body() body: TwoFactorChallengeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenDto> {
    const result = await this.auth.answerChallenge(body.challengeToken, {
      code: body.code,
      recoveryCode: body.recoveryCode,
    });
    setRefreshCookie(res, this.config, result.refreshToken, {
      expiresAt: result.expiresAt,
      now: this.clock.now(),
    });
    return accessToken(result.accessToken);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: 'Get a new access token with the refresh cookie',
    description:
      'Call from the browser only: the Origin header must be a frontend origin. Each refresh replaces the cookie. The previous token still answers within 30 seconds of being replaced (no new cookie); after that, using it again ends the session.',
  })
  @ApiOkResponse({ type: AccessTokenDto })
  @ApiErrorResponses(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  async refresh(
    @Req() req: Request,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenDto> {
    assertAllowedOrigin(req, this.config);
    const outcome = await this.sessions.refresh(readRefreshCookie(req), client);
    if (outcome.kind === 'refused') {
      clearRefreshCookie(res, this.config);
      throw new Unauthenticated();
    }
    if (outcome.kind === 'inactive') {
      clearRefreshCookie(res, this.config);
      throw new AccountNotActive(
        accessDeniedMessage(outcome.user.accountStatus),
      );
    }
    if (outcome.kind === 'rotated')
      setRefreshCookie(res, this.config, outcome.refreshToken, {
        expiresAt: outcome.session.expiresAt,
        now: this.clock.now(),
      });
    return accessToken(
      await this.tokens.issue({
        sub: outcome.user.id,
        sid: outcome.session.id,
      }),
    );
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: 'End the session of the refresh cookie',
    description: 'Origin must be a frontend origin.',
  })
  @ApiNoContentResponse({
    description: 'Signed out (also when the cookie was missing or invalid)',
  })
  @ApiErrorResponses(HttpStatus.FORBIDDEN, HttpStatus.TOO_MANY_REQUESTS)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    assertAllowedOrigin(req, this.config);
    const session = await this.sessions.findByRefreshToken(
      readRefreshCookie(req),
    );
    if (session) await this.sessions.revoke(session.id);
    clearRefreshCookie(res, this.config);
  }

  @Post('confirm-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Confirm the password for sensitive actions',
    description:
      'Two-factor changes and signing out other sessions need a confirmation younger than 3 hours.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  async confirmPassword(
    @CurrentAuth() auth: AuthContext,
    @Body() body: ConfirmPasswordDto,
  ): Promise<void> {
    if (!(await this.hasher.verify(auth.user.passwordHash, body.password))) {
      throw new RuleViolation(Messages.wrongPassword, {
        password: [Messages.wrongPassword],
      });
    }
    await this.sessions.confirmPassword(auth.session.id);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Email a password reset link',
    description: 'Always answers 202, whether or not the email has an account.',
  })
  @ApiAcceptedResponse()
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.TOO_MANY_REQUESTS)
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<void> {
    await this.passwordResets.requestReset(body.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Set a new password with a reset token',
    description: 'Ends every session of the account.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  async resetPassword(@Body() body: ResetPasswordDto): Promise<void> {
    await this.passwordResets.reset(body.token, body.password);
  }

  @Post('email/verification-notification')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth('bearer')
  @Throttle({
    default: { limit: 6, ttl: PER_MINUTE, getTracker: verificationTracker },
  })
  @ApiOperation({
    summary: 'Email a new verification link',
    description: 'Nothing is sent when the address is already verified.',
  })
  @ApiAcceptedResponse()
  @ApiErrorResponses(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  async sendVerification(@CurrentAuth() auth: AuthContext): Promise<void> {
    await this.emailVerification.send(auth.user);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Verify the email address with the token from the link',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  async verifyEmail(@Body() body: VerifyEmailDto): Promise<void> {
    await this.emailVerification.verify(body.token);
  }
}

import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppCrypto } from '../common/crypto/app-crypto.service.js';
import { EmailDomainChecker } from '../common/validation/email-domain.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthGuard, PasswordChangeGuard } from './auth/auth.guard.js';
import { AuthService } from './auth/auth.service.js';
import { SessionService } from './auth/session.service.js';
import { SessionsController } from './auth/sessions.controller.js';
import { TokenService } from './auth/token.service.js';
import { TwoFactorAttemptsMiddleware } from './auth/two-factor-attempts.middleware.js';
import { EmailVerificationService } from './email-verification/email-verification.service.js';
import { AccountInvitation } from './entities/account-invitation.entity.js';
import { AuthSession } from './entities/auth-session.entity.js';
import { PasswordResetToken } from './entities/password-reset-token.entity.js';
import { User } from './entities/user.entity.js';
import { FrontendLinks } from './identity-mails.js';
import { IdentityMaintenance } from './identity-maintenance.service.js';
import { InvitationService } from './invitations/invitation.service.js';
import { InvitationsController } from './invitations/invitations.controller.js';
import { PasswordHasher } from './password-hasher.js';
import { PasswordResetService } from './password-reset/password-reset.service.js';
import { MeController } from './profile/me.controller.js';
import { ProfileService } from './profile/profile.service.js';
import { TwoFactorController } from './two-factor/two-factor.controller.js';
import { TwoFactorService } from './two-factor/two-factor.service.js';

// Stage 1: accounts, invitations, sign-in, sessions, two-factor, password
// reset, email verification and the own profile.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      AccountInvitation,
      AuthSession,
      PasswordResetToken,
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [
    AuthController,
    SessionsController,
    TwoFactorController,
    InvitationsController,
    MeController,
  ],
  providers: [
    AppCrypto,
    EmailDomainChecker,
    PasswordHasher,
    FrontendLinks,
    TokenService,
    SessionService,
    AuthService,
    TwoFactorService,
    InvitationService,
    PasswordResetService,
    EmailVerificationService,
    ProfileService,
    IdentityMaintenance,
    AuthGuard,
    PasswordChangeGuard,
  ],
  exports: [
    AuthGuard,
    PasswordChangeGuard,
    InvitationService,
    SessionService,
    IdentityMaintenance,
    AppCrypto,
    EmailDomainChecker,
  ],
})
export class IdentityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TwoFactorAttemptsMiddleware).forRoutes({
      path: 'auth/two-factor-challenge',
      method: RequestMethod.POST,
      version: '1',
    });
  }
}

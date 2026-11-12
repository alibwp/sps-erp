import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AcademicPeriodGuard } from './academic/academic-period.guard.js';
import { AcademicModule } from './academic/academic.module.js';
import { CurriculumModule } from './curriculum/curriculum.module.js';
import { EnrollmentsModule } from './enrollments/enrollments.module.js';
import { GraduatedGuard } from './enrollments/graduated.guard.js';
import { AccessGuard } from './access/access.guard.js';
import { AccessModule } from './access/access.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuditModule } from './audit/audit.module.js';
import { CommonModule } from './common/common.module.js';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { createValidationPipe } from './common/errors/validation.js';
import { loggerOptions } from './common/logging/logging.js';
import { RequestContextMiddleware } from './common/request-context/request-context.js';
import {
  API_RATE_LIMIT,
  UserOrIpThrottlerGuard,
} from './common/throttle/user-or-ip-throttler.guard.js';
import { validateEnvironment } from './config/environment.js';
import { DatabaseModule } from './database/database.module.js';
import { FeaturesModule } from './features/features.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthGuard, PasswordChangeGuard } from './identity/auth/auth.guard.js';
import { IdentityModule } from './identity/identity.module.js';
import { MailModule } from './mail/mail.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RedisModule } from './redis/redis.module.js';
import { SchedulerModule } from './scheduler/scheduler.module.js';
import { StorageModule } from './storage/storage.module.js';

@Module({
  imports: [
    // Loads .env.<NODE_ENV> first, then .env. Variables already set in the
    // real environment (Docker, hosting platform) always win over the files.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      validate: validateEnvironment,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: loggerOptions,
    }),
    ThrottlerModule.forRoot({
      throttlers: [API_RATE_LIMIT],
      errorMessage: 'Too many requests. Please wait a moment and try again.',
    }),
    CommonModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    StorageModule,
    MailModule,
    HealthModule,
    AuditModule,
    IdentityModule,
    FeaturesModule,
    AccessModule,
    OrganizationsModule,
    AccountsModule,
    AcademicModule,
    CurriculumModule,
    EnrollmentsModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    // Global guards run in this order: who is calling, whether they must
    // change their password first, the rate limit (per user once signed
    // in, per IP otherwise), the working campus, feature switch, verified
    // email and permission of the route, then the working academic period
    // of routes that need one.
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: PasswordChangeGuard },
    { provide: APP_GUARD, useClass: UserOrIpThrottlerGuard },
    { provide: APP_GUARD, useExisting: AccessGuard },
    { provide: APP_GUARD, useExisting: AcademicPeriodGuard },
    { provide: APP_GUARD, useExisting: GraduatedGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware)
      .forRoutes({ path: '{/*splat}', method: RequestMethod.ALL });
  }
}

import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import {
  AdminsController,
  ParentsController,
  TeachersController,
} from './people.controllers.js';
import { People } from './people.service.js';

// Stage 5 part 3: teachers, administrators and parents of a campus. The
// guardian links themselves live with the learners (EnrollmentsModule).
@Module({
  imports: [AccessModule, AccountsModule, EnrollmentsModule, IdentityModule],
  controllers: [TeachersController, AdminsController, ParentsController],
  providers: [People],
  exports: [People],
})
export class PeopleModule {}

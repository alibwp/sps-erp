import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { NoticeNotificationPreference } from './entities/notice-notification-preference.entity.js';
import { NoticeRecipient } from './entities/notice-recipient.entity.js';
import { Notice } from './entities/notice.entity.js';
import { NoticeAudience } from './notice-audience.service.js';
import { NoticePublisher } from './notice-publisher.service.js';
import {
  MyNoticesController,
  NoticePreferencesController,
  NoticesController,
} from './notices.controllers.js';
import { Notices } from './notices.service.js';

// Stage 7: notices. Drafts are written and revised here; publishing fixes
// the recipients once, the notices queue sends the emails, and the
// maintenance job publishes due notices and expires finished ones.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notice,
      NoticeRecipient,
      NoticeNotificationPreference,
    ]),
    CurriculumModule,
  ],
  controllers: [
    NoticesController,
    MyNoticesController,
    NoticePreferencesController,
  ],
  providers: [Notices, NoticeAudience, NoticePublisher],
  exports: [NoticePublisher],
})
export class NoticesModule {}

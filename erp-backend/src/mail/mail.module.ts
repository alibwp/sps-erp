import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailProcessor } from './mail.processor.js';
import { MailService } from './mail.service.js';
import { MAIL_TRANSPORT, createMailTransport } from './mail.transport.js';

@Global()
@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: createMailTransport,
    },
    MailService,
    MailProcessor,
  ],
  exports: [MailService],
})
export class MailModule {}

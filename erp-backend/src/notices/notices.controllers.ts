import {
  Body,
  CallHandler,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  NestInterceptor,
  Param,
  ParseUUIDPipe,
  Patch,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { catchError, type Observable } from 'rxjs';
import {
  Campus,
  type CampusAccess,
  CampusRoute,
  RequirePermission,
  RequireVerifiedEmail,
} from '../access/access-context.js';
import { ValidationFailed } from '../common/errors/api-exception.js';
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import {
  type AuthContext,
  CurrentAuth,
} from '../identity/auth/auth-context.js';
import { contentDisposition } from '../storage/s3.driver.js';
import type { NoticeRecipient } from './entities/notice-recipient.entity.js';
import type { Notice } from './entities/notice.entity.js';
import { ATTACHMENT_MAX_BYTES } from './notices.constants.js';
import {
  CreateNoticeDto,
  MyNoticeDto,
  MyNoticesQueryDto,
  NoticeDto,
  NoticePreferenceDto,
  NoticeQueryDto,
  NoticeRecipientDto,
  ScheduleNoticeDto,
  UpdateNoticeDto,
} from './notices.dto.js';
import { NoticeMessages, Notices, type Reader } from './notices.service.js';

const ERRORS = [
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
] as const;
const WRITE_ERRORS = [...ERRORS, HttpStatus.UNPROCESSABLE_ENTITY] as const;

const reader = (auth: AuthContext, campus: CampusAccess): Reader => ({
  id: auth.user.id,
  permissions: campus.permissions,
});

const mayManage = (campus: CampusAccess) =>
  campus.permissions.has('update notice') ||
  campus.permissions.has('delete notice');

function noticeDto(notice: Notice, showAudience: boolean): NoticeDto {
  return {
    id: notice.id,
    title: notice.title,
    content: notice.content,
    status: notice.status,
    startDate: notice.startDate,
    stopDate: notice.stopDate,
    sendEmail: notice.sendEmail,
    scheduledFor: notice.scheduledFor,
    publishedAt: notice.publishedAt,
    revision: notice.revision,
    revisionOfId: notice.revisionOfId,
    attachment: notice.attachmentKey
      ? {
          name: notice.attachmentName ?? 'notice-attachment',
          mimeType: notice.attachmentMimeType ?? 'application/octet-stream',
          size: notice.attachmentSize ?? 0,
        }
      : null,
    audience: showAudience ? notice.audience : null,
    createdAt: notice.createdAt,
  };
}

// Multer stops reading at the size limit; that answer becomes the same 400
// as any other attachment problem.
@Injectable()
class AttachmentTooLarge implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof PayloadTooLargeException) {
          throw new ValidationFailed({
            attachment: [NoticeMessages.attachmentSize],
          });
        }
        throw error;
      }),
    );
  }
}

// Notices of the campus (reference NoticeController, NoticeService,
// PublishNotice, ReviseNotice, NoticePolicy, NoticeAttachmentController).
@ApiTags('Notices')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('notices')
export class NoticesController {
  constructor(private readonly notices: Notices) {}

  @Get()
  @RequirePermission('read notice')
  @ApiOperation({
    summary: 'Notices of the campus',
    description:
      'Every status for "update notice" or "delete notice"; published ones otherwise. People who only hold the parent or student role see the notices they received.',
  })
  @ApiOkResponse({ type: [NoticeDto] })
  @ApiErrorResponses(...ERRORS)
  async list(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Query() query: NoticeQueryDto,
  ): Promise<NoticeDto[]> {
    const notices = await this.notices.list(
      campus.school.id,
      reader(auth, campus),
      query,
    );
    return notices.map((notice) => noticeDto(notice, mayManage(campus)));
  }

  @Post()
  @RequireVerifiedEmail()
  @RequirePermission('create notice')
  @ApiOperation({
    summary: 'Write a notice (a draft)',
    description:
      'Content is cleaned to a short list of safe tags; plain text becomes paragraphs. Nobody receives it until it is published.',
  })
  @ApiCreatedResponse({ type: NoticeDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async create(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Body() body: CreateNoticeDto,
  ): Promise<NoticeDto> {
    const notice = await this.notices.create(
      auth.user.id,
      campus.school.id,
      body,
    );
    return noticeDto(notice, true);
  }

  @Get(':id')
  @RequirePermission('read notice')
  @ApiOperation({
    summary: 'One notice',
    description:
      'A draft, scheduled or archived notice only for "update notice" or "delete notice".',
  })
  @ApiOkResponse({ type: NoticeDto })
  @ApiErrorResponses(...ERRORS)
  async show(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NoticeDto> {
    const notice = await this.notices.find(
      campus.school.id,
      id,
      reader(auth, campus),
    );
    return noticeDto(notice, mayManage(campus));
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  @RequirePermission('update notice')
  @ApiOperation({
    summary: 'Change a draft or scheduled notice',
    description: 'A published notice is revised instead.',
  })
  @ApiOkResponse({ type: NoticeDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async update(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateNoticeDto,
  ): Promise<NoticeDto> {
    return noticeDto(
      await this.notices.update(campus.school.id, id, body),
      true,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireVerifiedEmail()
  @RequirePermission('delete notice')
  @ApiOperation({
    summary: 'Delete a draft that was never published',
    description: 'Any other notice is archived instead.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(...WRITE_ERRORS)
  async remove(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.notices.remove(campus.school.id, id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update notice')
  @ApiOperation({
    summary: 'Publish a draft or scheduled notice now',
    description:
      'Fixes the recipients from the audience, supersedes the revision it replaces, and queues the emails when asked for. Publishing again changes nothing.',
  })
  @ApiOkResponse({ type: NoticeDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async publish(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NoticeDto> {
    const notice = await this.notices.publish(
      auth.user.id,
      campus.school.id,
      id,
    );
    return noticeDto(notice, true);
  }

  @Post(':id/schedule')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update notice')
  @ApiOperation({
    summary: 'Publish a draft later',
    description: 'Published by the job that runs every 15 minutes.',
  })
  @ApiOkResponse({ type: NoticeDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async schedule(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ScheduleNoticeDto,
  ): Promise<NoticeDto> {
    const notice = await this.notices.schedule(
      auth.user.id,
      campus.school.id,
      id,
      new Date(body.scheduledFor),
    );
    return noticeDto(notice, true);
  }

  @Post(':id/unschedule')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update notice')
  @ApiOperation({ summary: 'Take a scheduled notice back to draft' })
  @ApiOkResponse({ type: NoticeDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async unschedule(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NoticeDto> {
    return noticeDto(await this.notices.unschedule(campus.school.id, id), true);
  }

  @Post(':id/revise')
  @RequireVerifiedEmail()
  @RequirePermission('update notice')
  @ApiOperation({
    summary: 'Start a revision of a published notice',
    description:
      'A new draft with the changes and the same attachment. Publishing it supersedes this notice.',
  })
  @ApiCreatedResponse({ type: NoticeDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async revise(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateNoticeDto,
  ): Promise<NoticeDto> {
    const revision = await this.notices.revise(
      auth.user.id,
      campus.school.id,
      id,
      body,
    );
    return noticeDto(revision, true);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('delete notice')
  @ApiOperation({
    summary: 'Archive a notice',
    description:
      'Not for a superseded notice. Archiving again changes nothing.',
  })
  @ApiOkResponse({ type: NoticeDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async archive(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NoticeDto> {
    return noticeDto(await this.notices.archive(campus.school.id, id), true);
  }

  @Get(':id/recipients')
  @RequirePermission('update notice')
  @ApiOperation({
    summary: 'Who a published notice reached',
    description: 'With the reason when an email could not be sent.',
  })
  @ApiOkResponse({ type: [NoticeRecipientDto] })
  @ApiErrorResponses(...ERRORS)
  async recipients(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NoticeRecipientDto[]> {
    const rows = await this.notices.recipients(campus.school.id, id);
    return rows.map((row: NoticeRecipient) => ({
      userId: row.userId,
      name: row.user?.name ?? '',
      state: row.state,
      deliveredAt: row.deliveredAt,
      readAt: row.readAt,
      dismissedAt: row.dismissedAt,
      failureReason: row.failureReason,
    }));
  }

  @Put(':id/attachment')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update notice')
  @UseInterceptors(
    AttachmentTooLarge,
    FileInterceptor('attachment', {
      limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1, fields: 0 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['attachment'],
      properties: {
        attachment: {
          type: 'string',
          format: 'binary',
          description: 'jpg, png, gif, pdf, doc or docx, at most 10 MB',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Attach or replace the file of a draft or scheduled notice',
    description: 'The type is checked from the file content.',
  })
  @ApiOkResponse({ type: NoticeDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async setAttachment(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer; originalname?: string } | undefined,
  ): Promise<NoticeDto> {
    const notice = await this.notices.setAttachment(campus.school.id, id, file);
    return noticeDto(notice, true);
  }

  @Delete(':id/attachment')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update notice')
  @ApiOperation({ summary: 'Remove the file of a draft or scheduled notice' })
  @ApiOkResponse({ type: NoticeDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async removeAttachment(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NoticeDto> {
    const notice = await this.notices.removeAttachment(campus.school.id, id);
    return noticeDto(notice, true);
  }

  // No permission on the route: a recipient may download the file of a
  // notice they received; anyone else needs "read notice" and must be
  // able to see the notice.
  @Get(':id/attachment')
  @ApiOperation({
    summary: 'Download the attachment',
    description:
      'For the people the notice reached, and for "read notice" holders who can see the notice.',
  })
  @ApiOkResponse({
    description: 'The file',
    content: {
      'application/octet-stream': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiErrorResponses(...ERRORS)
  async download(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.notices.attachment(
      campus.school.id,
      id,
      reader(auth, campus),
    );
    res
      .type(file.mimeType)
      .setHeader('Content-Disposition', contentDisposition(file.name))
      .setHeader('X-Content-Type-Options', 'nosniff')
      .setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.content);
  }
}

// The signed-in person's own notices at the working campus (reference
// NoticeRecipient actions on the dashboard).
@ApiTags('Notices')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('my-notices')
export class MyNoticesController {
  constructor(private readonly notices: Notices) {}

  @Get()
  @ApiOperation({
    summary: 'Notices you received here',
    description:
      'Published notices whose start date has come, newest first. Dismissed ones only when asked for.',
  })
  @ApiOkResponse({ type: [MyNoticeDto] })
  @ApiErrorResponses(...ERRORS)
  async list(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Query() query: MyNoticesQueryDto,
  ): Promise<MyNoticeDto[]> {
    const rows = await this.notices.mine(
      campus.school,
      auth.user.id,
      query.includeDismissed ?? false,
    );
    return rows.map(({ notice, recipient }) => ({
      ...noticeDto(notice, false),
      state: recipient.state,
      readAt: recipient.readAt,
      dismissedAt: recipient.dismissedAt,
    }));
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a notice you received as read' })
  @ApiNoContentResponse()
  @ApiErrorResponses(...ERRORS)
  async read(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.notices.markRead(campus.school.id, auth.user.id, id);
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Dismiss a notice you received' })
  @ApiNoContentResponse()
  @ApiErrorResponses(...ERRORS)
  async dismiss(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.notices.dismiss(campus.school.id, auth.user.id, id);
  }
}

// Whether the signed-in person gets notice emails from the working campus.
// Switched off, they still see the notices.
@ApiTags('Notices')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('notice-preferences')
export class NoticePreferencesController {
  constructor(private readonly notices: Notices) {}

  @Get()
  @ApiOperation({ summary: 'Your notice email setting here' })
  @ApiOkResponse({ type: NoticePreferenceDto })
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  async show(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
  ): Promise<NoticePreferenceDto> {
    return {
      emailEnabled: await this.notices.emailEnabled(
        auth.user.id,
        campus.school.id,
      ),
    };
  }

  @Put()
  @ApiOperation({ summary: 'Turn notice emails from this campus on or off' })
  @ApiOkResponse({ type: NoticePreferenceDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  async update(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Body() body: NoticePreferenceDto,
  ): Promise<NoticePreferenceDto> {
    return {
      emailEnabled: await this.notices.setEmailEnabled(
        auth.user.id,
        campus.school.id,
        body.emailEnabled,
      ),
    };
  }
}

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
  Patch,
  PayloadTooLargeException,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { catchError, type Observable } from 'rxjs';
import { ValidationFailed } from '../../common/errors/api-exception.js';
import { ApiErrorResponses } from '../../common/openapi/openapi.js';
import {
  AllowDuringPasswordChange,
  type AuthContext,
  CurrentAuth,
} from '../auth/auth-context.js';
import type { User } from '../entities/user.entity.js';
import { ChangePasswordDto, MeDto, UpdateProfileDto } from '../identity.dto.js';
import { PHOTO_MAX_BYTES, ProfileService } from './profile.service.js';
import { AllowGraduatedLearners } from '../../access/access-context.js';

// Multer stops reading at the size limit; that answer becomes the same 400
// as any other photo problem.
@Injectable()
class PhotoTooLarge implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof PayloadTooLargeException) {
          throw new ValidationFailed({
            photo: ['The photo field must not be greater than 3000 kilobytes.'],
          });
        }
        throw error;
      }),
    );
  }
}

@ApiTags('Me')
@ApiBearerAuth('bearer')
@AllowGraduatedLearners()
@Controller('me')
export class MeController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  @AllowDuringPasswordChange()
  @ApiOperation({ summary: 'Your profile' })
  @ApiOkResponse({ type: MeDto })
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  me(@CurrentAuth() auth: AuthContext): Promise<MeDto> {
    return this.toDto(auth.user);
  }

  @Patch()
  @ApiOperation({
    summary: 'Change your profile',
    description:
      'Only the fields sent change; null clears an optional field. A new email address must be verified again.',
  })
  @ApiOkResponse({ type: MeDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  async update(
    @CurrentAuth() auth: AuthContext,
    @Body() body: UpdateProfileDto,
  ): Promise<MeDto> {
    return this.toDto(await this.profile.update(auth.user.id, body));
  }

  @Put('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowDuringPasswordChange()
  @ApiOperation({
    summary: 'Change your password',
    description: 'Ends every other session.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    await this.profile.changePassword(
      auth.user.id,
      auth.session.id,
      body.currentPassword,
      body.password,
    );
  }

  @Post('photo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    PhotoTooLarge,
    FileInterceptor('photo', {
      limits: { fileSize: PHOTO_MAX_BYTES, files: 1, fields: 0 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['photo'],
      properties: {
        photo: {
          type: 'string',
          format: 'binary',
          description: 'jpg or png, at most 3000 KB',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload your profile photo',
    description: 'The type is checked from the file content.',
  })
  @ApiOkResponse({ type: MeDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  async uploadPhoto(
    @CurrentAuth() auth: AuthContext,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<MeDto> {
    return this.toDto(await this.profile.setPhoto(auth.user.id, file?.buffer));
  }

  @Delete('photo')
  @ApiOperation({ summary: 'Remove your profile photo' })
  @ApiOkResponse({ type: MeDto })
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  async removePhoto(@CurrentAuth() auth: AuthContext): Promise<MeDto> {
    return this.toDto(await this.profile.removePhoto(auth.user.id));
  }

  private async toDto(user: User): Promise<MeDto> {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      accountStatus: user.accountStatus,
      passwordChangeRequired: user.passwordChangeRequiredAt !== null,
      twoFactorEnabled: user.twoFactorConfirmedAt !== null,
      birthday: user.birthday,
      gender: user.gender,
      phone: user.phone,
      address: user.address,
      addressLine2: user.addressLine2,
      city: user.city,
      state: user.state,
      postalCode: user.postalCode,
      country: user.country,
      nationality: user.nationality,
      profilePhotoUrl: await this.profile.photoUrl(user),
      createdAt: user.createdAt,
    };
  }
}

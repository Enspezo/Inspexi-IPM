// POST /photos/upload  (multipart, PWA) ; GET /photos/:id/download (auth, org-scoped).

import {
  Controller, Post, Get, Param, Body, Query, UploadedFile,
  ParseFilePipe, MaxFileSizeValidator, Headers, Res, StreamableFile,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import { User } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF } from '@/common/auth/roles';
import { PhotosService } from './photos.service';
import { PhotoUploadDto } from './dto';
import { ParseUuidPipe } from '@/common';

const ALL = ALL_STAFF;

@ApiTags('Photos')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller('photos')
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Post('upload')
  @Roles(...ALL)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Foto uploaden voor asset/finding/inspectionPlan' })
  // Multer-level size cap so an oversized body is rejected before it is fully
  // buffered into memory; the MaxFileSizeValidator is the defence-in-depth check
  // after buffering (SEC-12).
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async upload(
    @UploadedFile(
      new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: 25 * 1024 * 1024 })] }),
    )
    file: Express.Multer.File,
    @Body() dto: PhotoUploadDto,
    @CurrentUser() user: User,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const data = await this.photos.upload(file, dto, user, deviceId);
    return { success: true, data };
  }

  @Get(':id/download')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Foto downloaden (org-scoped stream)' })
  async download(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
    @Query('thumb') thumb?: string,
  ): Promise<StreamableFile> {
    const { buffer, mimeType } = await this.photos.getFile(id, user, Boolean(thumb));
    res.set({ 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=86400' });
    return new StreamableFile(buffer);
  }
}

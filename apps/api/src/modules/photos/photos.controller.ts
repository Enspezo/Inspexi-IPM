// POST /photos/upload  (multipart, PWA) ; GET /photos/:id/download (auth, org-scoped).

import {
  Controller, Post, Get, Param, Body, Query, UploadedFile,
  ParseFilePipe, MaxFileSizeValidator, ParseUUIDPipe, Headers, Res, StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import { User, Role } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { PhotosService } from './photos.service';
import { PhotoUploadDto } from './dto';

const ALL = [
  Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER,
  Role.BACKOFFICE, Role.WERKVOORBEREIDER, Role.INSPECTEUR,
] as const;

@ApiTags('Photos')
@ApiBearerAuth()
@Controller('photos')
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Post('upload')
  @Roles(...ALL)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Foto uploaden voor asset/finding/inspectionPlan' })
  @UseInterceptors(FileInterceptor('file'))
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
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
    @Query('thumb') thumb?: string,
  ): Promise<StreamableFile> {
    const { buffer, mimeType } = await this.photos.getFile(id, user, Boolean(thumb));
    res.set({ 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=86400' });
    return new StreamableFile(buffer);
  }
}

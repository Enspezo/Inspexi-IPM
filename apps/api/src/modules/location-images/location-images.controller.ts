import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Headers,
  Res,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  HttpStatus,
  FileValidator,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { User, Role } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { LocationImagesService } from './location-images.service';
import {
  CreateMarkerDto,
  UpdateMarkerDto,
  QuickCreateAssetDto,
  QuickCreateMeasurementDto,
  QuickCreateFindingDto,
} from './dto';

/**
 * Image-only MIME validator (zie documents.controller MimeTypeValidator).
 * NestJS' ingebouwde FileTypeValidator gebruikt magic bytes; deze checkt de
 * door multer geleverde mimetype en staat alleen afbeeldingen toe.
 */
const ALLOWED_IMAGE_MIME_REGEX = /^image\/(jpeg|png|webp|svg\+xml)$/;

class ImageMimeTypeValidator extends FileValidator {
  constructor() {
    super({});
  }

  isValid(file?: Express.Multer.File): boolean {
    if (!file) return false;
    return ALLOWED_IMAGE_MIME_REGEX.test(file.mimetype);
  }

  buildErrorMessage(): string {
    return 'Bestandstype niet toegestaan. Alleen afbeeldingen (JPEG, PNG, WebP, SVG).';
  }
}

const ALL = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
  Role.INSPECTEUR,
] as const;

@ApiTags('location-images')
@ApiBearerAuth()
@Controller()
export class LocationImagesController {
  constructor(private readonly service: LocationImagesService) {}

  // ── Afbeelding ──

  @Get('locations/:locationId/image')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Locatie-afbeelding ophalen (incl. markers)' })
  async getImage(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.getImageByLocation(locationId, user) };
  }

  @Get('locations/:locationId/image/file')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Locatie-afbeelding (bytes) streamen voor preview/download' })
  async getImageFile(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const { buffer, image } = await this.service.getImageFile(locationId, user);
    res.set({
      'Content-Type': image.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(
        image.originalFilename ?? 'afbeelding',
      )}"`,
      'Content-Length': buffer.length.toString(),
    });
    res.send(buffer);
  }

  @Post('locations/:locationId/image')
  @Roles(...ALL)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Locatie-afbeelding uploaden (één per locatie)' })
  async uploadImage(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @UploadedFile(
      new ParseFilePipe({
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new ImageMimeTypeValidator(),
        ],
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: User,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return {
      success: true,
      data: await this.service.uploadImage(locationId, user, file, deviceId),
    };
  }

  @Delete('locations/:locationId/image')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Locatie-afbeelding verwijderen (markers cascaden mee)' })
  async deleteImage(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.deleteImage(locationId, user) };
  }

  // ── Markers ──

  @Get('location-images/:imageId/markers')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Markers van een afbeelding ophalen' })
  async listMarkers(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.listMarkers(imageId, user) };
  }

  @Post('location-images/:imageId/markers')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Marker aanmaken' })
  async createMarker(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateMarkerDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return { success: true, data: await this.service.createMarker(imageId, user, dto, deviceId) };
  }

  @Patch('location-images/:imageId/markers/:markerId')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Marker bijwerken' })
  async updateMarker(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Param('markerId', ParseUUIDPipe) markerId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateMarkerDto,
  ) {
    return {
      success: true,
      data: await this.service.updateMarker(imageId, markerId, user, dto),
    };
  }

  @Delete('location-images/:imageId/markers/:markerId')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Marker verwijderen' })
  async deleteMarker(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Param('markerId', ParseUUIDPipe) markerId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.deleteMarker(imageId, markerId, user) };
  }

  // ── Snelacties ──

  @Post('location-images/:imageId/quick-asset')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Asset + marker aanmaken vanaf de afbeelding' })
  async quickCreateAsset(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() user: User,
    @Body() dto: QuickCreateAssetDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return {
      success: true,
      data: await this.service.quickCreateAsset(imageId, user, dto, deviceId),
    };
  }

  @Post('location-images/:imageId/quick-measurement')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meting + marker aanmaken vanaf de afbeelding' })
  async quickCreateMeasurement(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() user: User,
    @Body() dto: QuickCreateMeasurementDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return {
      success: true,
      data: await this.service.quickCreateMeasurement(imageId, user, dto, deviceId),
    };
  }

  @Post('location-images/:imageId/quick-finding')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Constatering + marker aanmaken vanaf de afbeelding' })
  async quickCreateFinding(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() user: User,
    @Body() dto: QuickCreateFindingDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return {
      success: true,
      data: await this.service.quickCreateFinding(imageId, user, dto, deviceId),
    };
  }
}

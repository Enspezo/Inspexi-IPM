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
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  HttpStatus,
  FileValidator,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { User } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF } from '@/common/auth/roles';
import { resolveImageResponseType, setBinaryResponseHeaders } from '@/common';
import { createHash } from 'crypto';
import { LocationImagesService } from './location-images.service';
import {
  CreateMarkerDto,
  UpdateMarkerDto,
  QuickCreateAssetDto,
  QuickCreateMeasurementDto,
  QuickCreateFindingDto,
} from './dto';
import { ParseUuidPipe } from '@/common';

/**
 * Image-only MIME validator (zie documents.controller MimeTypeValidator).
 * Checkt de door multer geleverde mimetype als eerste poort; de inhoud
 * (magic bytes) wordt daarna in de service gevalideerd (WP-B4). SVG is niet
 * meer toegestaan: de plattegrond wordt inline op het app-origin geserveerd
 * en een SVG met script was daar een stored-XSS-vector (B-507-klasse).
 */
const ALLOWED_IMAGE_MIME_REGEX = /^image\/(jpeg|png|webp)$/;

class ImageMimeTypeValidator extends FileValidator {
  constructor() {
    super({});
  }

  isValid(file?: Express.Multer.File): boolean {
    if (!file) return false;
    return ALLOWED_IMAGE_MIME_REGEX.test(file.mimetype);
  }

  buildErrorMessage(): string {
    return 'Bestandstype niet toegestaan. Alleen afbeeldingen (JPEG, PNG, WebP).';
  }
}

const ALL = ALL_STAFF;

@ApiTags('location-images')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller()
export class LocationImagesController {
  constructor(private readonly service: LocationImagesService) {}

  // ── Afbeelding ──

  @Get('locations/:locationId/image')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Locatie-afbeelding ophalen (incl. markers)' })
  async getImage(
    @Param('locationId', ParseUuidPipe) locationId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.getImageByLocation(locationId, user) };
  }

  @Get('locations/:locationId/image/file')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Locatie-afbeelding (bytes) streamen voor preview/download' })
  async getImageFile(
    @Param('locationId', ParseUuidPipe) locationId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const { buffer, image } = await this.service.getImageFile(locationId, user);
    // WP-B4: bytes bepalen het Content-Type (het opgeslagen mimetype was
    // client-supplied — een SVG/HTML-upload werd hier inline uitvoerbaar op
    // het app-origin). De URL is per locatie constant terwijl de afbeelding
    // vervangen kan worden → ETag volgt de opslagsleutel (nieuwe UUID per
    // upload), zoals bij het organisatielogo.
    const resolved = resolveImageResponseType(buffer, 'plattegrond');
    setBinaryResponseHeaders(res, {
      mimeType: resolved.mimeType,
      contentLength: buffer.length,
      filename: resolved.filename,
      disposition: resolved.disposition,
      cacheControl: 'private, max-age=300, must-revalidate',
      etag: `"${createHash('sha256').update(image.storagePath).digest('hex').slice(0, 32)}"`,
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
    @Param('locationId', ParseUuidPipe) locationId: string,
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
    @Param('locationId', ParseUuidPipe) locationId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.deleteImage(locationId, user) };
  }

  // ── Markers ──

  @Get('location-images/:imageId/markers')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Markers van een afbeelding ophalen' })
  async listMarkers(
    @Param('imageId', ParseUuidPipe) imageId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.listMarkers(imageId, user) };
  }

  @Post('location-images/:imageId/markers')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Marker aanmaken' })
  async createMarker(
    @Param('imageId', ParseUuidPipe) imageId: string,
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
    @Param('imageId', ParseUuidPipe) imageId: string,
    @Param('markerId', ParseUuidPipe) markerId: string,
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
    @Param('imageId', ParseUuidPipe) imageId: string,
    @Param('markerId', ParseUuidPipe) markerId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.deleteMarker(imageId, markerId, user) };
  }

  // ── Snelacties ──

  @Post('location-images/:imageId/quick-asset')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Asset + marker aanmaken vanaf de afbeelding' })
  async quickCreateAsset(
    @Param('imageId', ParseUuidPipe) imageId: string,
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
    @Param('imageId', ParseUuidPipe) imageId: string,
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
    @Param('imageId', ParseUuidPipe) imageId: string,
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

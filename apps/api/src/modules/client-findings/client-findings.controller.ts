// @Public() (staf-guards uit) + ClientJwtAuthGuard + @CurrentTenant (org-subdomein).
// GET resolution-photos/:id (auth-stream) · GET :id · POST :id/resolve (+ /photos) · DELETE :id/resolve.

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Public, CurrentTenant } from '@/common/decorators';
import { ClientJwtAuthGuard } from '@/common/guards/client-jwt-auth.guard';
import {
  CurrentClientUser,
  type CurrentClientUserData,
} from '@/common/decorators/current-client-user.decorator';
import { ClientFindingsService } from './client-findings.service';
import { ResolveFindingDto } from './dto';
import { ParseUuidPipe } from '@/common';

const photoFileFilter = (
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!/^image\/(jpeg|png|jpg)$/.test(file.mimetype)) {
    cb(new BadRequestException('Alleen JPG en PNG bestanden zijn toegestaan'), false);
    return;
  }
  cb(null, true);
};

@ApiTags('Client Findings')
@Public()
@UseGuards(ClientJwtAuthGuard)
@RequiresFeature('BASIS_INSPECTIES')
@Controller('client/findings')
export class ClientFindingsController {
  constructor(private readonly service: ClientFindingsService) {}

  @Get('resolution-photos/:id')
  @ApiOperation({ summary: 'Resolutie-foto downloaden (org + ClientAccess gescoped)' })
  async photo(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, mimeType } = await this.service.getResolutionPhoto(user, orgId, id);
    res.set({ 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=86400' });
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Constatering-detail met resoluties en foto’s (klant)' })
  async detail(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.getDetail(user, orgId, id) };
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Constatering als opgelost melden' })
  async resolve(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: ResolveFindingDto,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.resolve(user, orgId, id, dto) };
  }

  @Post(':id/resolve/photos')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Foto’s uploaden bij de openstaande resolutie' })
  @UseInterceptors(
    FilesInterceptor('photos', 5, {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: photoFileFilter,
    }),
  )
  async uploadPhotos(
    @Param('id', ParseUuidPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Geen foto’s ontvangen');
    }
    return { success: true, data: await this.service.uploadResolutionPhotos(user, orgId, id, files) };
  }

  @Delete(':id/resolve')
  @ApiOperation({ summary: 'Eigen openstaande resolutie terugtrekken' })
  async deleteResolution(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.deleteResolution(user, orgId, id) };
  }
}

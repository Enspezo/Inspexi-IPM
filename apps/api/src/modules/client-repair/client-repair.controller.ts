// Online herstel (PRD-14) — client-realm endpoints onder /client/repair.
//
// Auth-lagen per route:
//  - lookup: @Public + throttle 5/min; bewust GÉÉN @RequiresFeature — een 403
//    zou verraden dat de functie uit staat; de service geeft in álle
//    faalgevallen dezelfde generieke melding (PRD §14.3 besluit 11).
//  - sessions: ingelogde klant (ClientJwtAuthGuard) + ONLINE_HERSTEL.
//  - overige routes: RepairSessionGuard (Bearer-sessietoken) + ONLINE_HERSTEL.

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { RepairSession } from '@prisma/client';
import { Public, CurrentTenant } from '@/common/decorators';
import { resolveImageResponseType, setBinaryResponseHeaders } from '@/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ClientJwtAuthGuard } from '@/common/guards/client-jwt-auth.guard';
import {
  CurrentClientUser,
  type CurrentClientUserData,
} from '@/common/decorators/current-client-user.decorator';
import { ClientRepairService } from './client-repair.service';
import { RepairSessionGuard } from './repair-session.guard';
import { CurrentRepairSession } from './current-repair-session.decorator';
import {
  CompleteRepairDto,
  RepairLookupDto,
  RepairResolveDto,
  SignRepairDto,
  StartRepairSessionDto,
} from './dto';

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

@ApiTags('Client Repair')
@Public()
@Controller('client/repair')
export class ClientRepairController {
  constructor(private readonly service: ClientRepairService) {}

  @Post('lookup')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Anonieme herstel-toegang: rapportnummer + postcode → sessie' })
  async lookup(
    @Body() dto: RepairLookupDto,
    @CurrentTenant('orgId') orgId: string | null,
    @Ip() ip: string,
  ) {
    return { success: true, data: await this.service.lookup(orgId, dto, ip) };
  }

  @Post('sessions')
  @UseGuards(ClientJwtAuthGuard)
  @RequiresFeature('ONLINE_HERSTEL')
  @ApiOperation({ summary: 'Herstelsessie starten als ingelogde klant' })
  async startSession(
    @Body() dto: StartRepairSessionDto,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.startClientSession(user, orgId, dto) };
  }

  @Get('session')
  @UseGuards(RepairSessionGuard)
  @RequiresFeature('ONLINE_HERSTEL')
  @ApiOperation({ summary: 'Herstel-overzicht van de sessie (plan, samenvatting, constateringen)' })
  async session(@CurrentRepairSession() session: RepairSession) {
    return { success: true, data: await this.service.getSessionView(session) };
  }

  @Post('findings/:id/resolve')
  @UseGuards(RepairSessionGuard)
  @RequiresFeature('ONLINE_HERSTEL')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Herstel melden op een constatering (first-wins claim)' })
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RepairResolveDto,
    @CurrentRepairSession() session: RepairSession,
  ) {
    return { success: true, data: await this.service.claimFinding(session, id, dto) };
  }

  @Post('findings/:id/resolve/photos')
  @UseGuards(RepairSessionGuard)
  @RequiresFeature('ONLINE_HERSTEL')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Bewijsfoto’s uploaden bij de eigen herstelmelding' })
  @UseInterceptors(
    FilesInterceptor('photos', 5, {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: photoFileFilter,
    }),
  )
  async uploadPhotos(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentRepairSession() session: RepairSession,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Geen foto’s ontvangen');
    }
    return { success: true, data: await this.service.uploadResolutionPhotos(session, id, files) };
  }

  @Get('photos/:id')
  @UseGuards(RepairSessionGuard)
  @RequiresFeature('ONLINE_HERSTEL')
  @ApiOperation({ summary: 'Foto-stream (constatering- en resolutiefoto’s binnen het plan)' })
  async photo(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRepairSession() session: RepairSession,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer } = await this.service.getPhoto(session, id);
    // WP-B4: bytes bepalen het Content-Type (niet de sleutel-extensie of het
    // opgeslagen mimetype) + nosniff/sandbox; onherkenbare inhoud degradeert
    // naar octet-stream.
    const resolved = resolveImageResponseType(buffer, 'foto');
    setBinaryResponseHeaders(res, {
      mimeType: resolved.mimeType,
      contentLength: buffer.length,
      filename: resolved.filename,
      disposition: resolved.disposition,
      cacheControl: 'private, max-age=86400',
    });
    return new StreamableFile(buffer);
  }

  @Post('complete')
  @UseGuards(RepairSessionGuard)
  @RequiresFeature('ONLINE_HERSTEL')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Afronden: selectie valideren + concept-herstelverklaring genereren' })
  async complete(
    @Body() dto: CompleteRepairDto,
    @CurrentRepairSession() session: RepairSession,
  ) {
    return { success: true, data: await this.service.complete(session, dto) };
  }

  @Post('sign')
  @UseGuards(RepairSessionGuard)
  @RequiresFeature('ONLINE_HERSTEL')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Herstelverklaring digitaal ondertekenen (rol HERSTELLER)' })
  async sign(
    @Body() dto: SignRepairDto,
    @CurrentRepairSession() session: RepairSession,
    @Ip() ip: string,
  ) {
    return { success: true, data: await this.service.sign(session, dto, ip) };
  }

  @Get('declaration/pdf')
  @UseGuards(RepairSessionGuard)
  @RequiresFeature('ONLINE_HERSTEL')
  @ApiOperation({ summary: 'PDF-download van de ondertekende herstelverklaring van deze sessie' })
  async declarationPdf(
    @CurrentRepairSession() session: RepairSession,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.service.getDeclarationPdf(session);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public, CurrentTenant } from '@/common/decorators';
import { setBinaryResponseHeaders, sanitizeDispositionFilename } from '@/common';
import { TenantContext } from '@/common/interfaces/tenant-context.interface';
import { PlanningPublicService } from './planning-public.service';
import { PlanningIcalService } from './planning-ical.service';
import { AddQuestionDto, CreateRescheduleRequestDto } from './dto';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '@/common/services/storage/storage.interface';
import { Inject } from '@nestjs/common';

// @Public() staat per route (niet op klasseniveau) zodat een nieuw endpoint niet
// per ongeluk publiek wordt — elke route verklaart dat expliciet.
//
// F1 (staging-review, WP-B7-patroon): bewust GEEN klasse-brede @RequiresFeature —
// de FeatureGuard zou de entitlement tegen de BEZOEKENDE tenant evalueren en op
// het apex-domein (`PUBLIC_URL`, geen tenant-org) in productie 403 geven. De
// feature-gate (UITVOERING_COMPLEET) zit in PlanningPublicService, tegen de
// eigenaar-org van de afspraak. Elke handler injecteert @CurrentTenant() zodat
// de token-lookup aan het bezochte subdomein gebonden is (`publicTenantWhere`).
// Token-routes zijn capability-URLs → per-IP throttle (F7).
@ApiTags('Planning (public)')
@Controller('public/planning')
export class PlanningPublicController {
  constructor(
    private readonly service: PlanningPublicService,
    private readonly icalService: PlanningIcalService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get(':token')
  @ApiOperation({ summary: 'Afspraakdetails ophalen (publiek)' })
  async findByToken(@Param('token') token: string, @CurrentTenant() tenant: TenantContext) {
    const data = await this.service.findByPublicToken(token, tenant);
    return { success: true, data };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':token/questions')
  @ApiOperation({ summary: 'Vraag stellen als klant (publiek)' })
  @HttpCode(HttpStatus.CREATED)
  async addClientQuestion(
    @Param('token') token: string,
    @Body() dto: AddQuestionDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    const data = await this.service.addClientQuestion(token, dto, tenant);
    return { success: true, data };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':token/reschedule-request')
  @ApiOperation({ summary: 'Afspraak verzetverzoek indienen (klant, publiek)' })
  @HttpCode(HttpStatus.CREATED)
  async createRescheduleRequest(
    @Param('token') token: string,
    @Body() dto: CreateRescheduleRequestDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    const data = await this.service.createRescheduleRequest(token, dto, tenant);
    return { success: true, data };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get(':token/documents')
  @ApiOperation({ summary: 'Gedeelde bijlagen ophalen (publiek)' })
  async getSharedDocuments(
    @Param('token') token: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    const data = await this.service.getSharedDocuments(token, tenant);
    return { success: true, data };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get(':token/documents/:docId/download')
  @ApiOperation({ summary: 'Gedeelde bijlage downloaden (publiek)' })
  async downloadSharedDocument(
    @Param('token') token: string,
    @Param('docId') docId: string,
    @CurrentTenant() tenant: TenantContext,
    @Res() res: Response,
  ) {
    // Token → afspraak → toegestane entiteiten → document (org-gebonden): in de service.
    const doc = await this.service.findSharedDocument(token, docId, tenant);

    const buffer = await this.storage.download(doc.storageKey);
    // Publieke route: attachment + nosniff + sandbox via de gedeelde helper (WP-B4).
    setBinaryResponseHeaders(res, {
      mimeType: doc.mimeType,
      contentLength: buffer.length,
      filename: sanitizeDispositionFilename(doc.originalName),
      disposition: 'attachment',
      cacheControl: 'private, no-store',
    });
    res.send(buffer);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get(':token/ics')
  @ApiOperation({ summary: '.ics bestand downloaden (publiek)' })
  async downloadIcs(
    @Param('token') token: string,
    @CurrentTenant() tenant: TenantContext,
    @Res() res: Response,
  ) {
    const item = await this.service.findForIcs(token, tenant);

    const ics = this.icalService.generateSingleEvent(item);
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="afspraak-${item.id}.ics"`,
    });
    res.send(ics);
  }
}

// ─── iCal feed controller ──────────────────────────────────
//
// F1: geen klasse-brede @RequiresFeature (zie hierboven); de feed-gate zit in
// PlanningIcalService.generatePersonalFeed tegen de org van de token-eigenaar.

@ApiTags('iCal')
@Controller('ical')
export class PlanningIcalController {
  private readonly logger = new Logger(PlanningIcalController.name);

  constructor(private readonly icalService: PlanningIcalService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get(':ical_token.ics')
  @ApiOperation({ summary: 'Persoonlijke iCal feed voor inspecteur' })
  async getPersonalFeed(
    @Param('ical_token') icalToken: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Toegangslog: tokens zijn permanent-achtig, dus elk gebruik vastleggen
    // (alleen token-prefix om de feed-URL niet zelf in de logs te lekken)
    this.logger.log(`iCal feed opgevraagd: token=${icalToken.slice(0, 8)}… ip=${req.ip}`);
    const ics = await this.icalService.generatePersonalFeed(icalToken);
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="inspexi-planning.ics"',
    });
    res.send(ics);
  }
}

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  Ip,
  Headers,
  ParseUUIDPipe,
  ForbiddenException,
  NotFoundException,
  HttpException,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { User, Role } from '@prisma/client';
import { ORG_ADMINS } from '@/common/auth/roles';
import { OrganizationsService } from './organizations.service';
import { SupportAccessService } from './support-access.service';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  AssignPlanDto,
  SetOrganizationFeatureDto,
  SetSupportAccessDto,
} from './dto';
import { Roles, CurrentUser, Public } from '@/common/decorators';
import { PrismaService } from '@/prisma';
import { EnumerationGuardService } from '@/common/services/enumeration-guard.service';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { FEATURE_KEYS } from '@inspexi/entitlements';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private organizationsService: OrganizationsService,
    private supportAccess: SupportAccessService,
    private prisma: PrismaService,
    private entitlements: EntitlementsService,
    private enumerationGuard: EnumerationGuardService,
  ) {}

  @Post()
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Nieuwe organisatie aanmaken (Superuser)' })
  @ApiResponse({ status: 201, description: 'Organisatie aangemaakt' })
  @ApiResponse({ status: 403, description: 'Niet geautoriseerd' })
  @ApiResponse({ status: 409, description: 'Slug al in gebruik' })
  async create(@Body() dto: CreateOrganizationDto) {
    const org = await this.organizationsService.create(dto);
    return { success: true, data: org };
  }

  @Get()
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Alle organisaties ophalen (Superuser)' })
  @ApiResponse({ status: 200, description: 'Lijst van organisaties' })
  async findAll() {
    const orgs = await this.organizationsService.findAll();
    return { success: true, data: orgs };
  }

  @Public()
  @Get('by-slug/:slug')
  @ApiOperation({ summary: 'Publieke branding info ophalen op slug (login pagina)' })
  @ApiResponse({ status: 200, description: 'Organisatie branding' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  @ApiResponse({ status: 429, description: 'Te veel mislukte pogingen' })
  async findBySlug(
    @Param('slug') slug: string,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Bescherm tegen brute-force enumeratie van geldige slugs. Deelt dezelfde
    // per-IP teller als TenantMiddleware, zodat beide enumeratie-vectoren
    // (controller + middleware-404) samen tellen.
    const blockedSeconds = this.enumerationGuard.isBlocked(ip);
    if (blockedSeconds > 0) {
      res.setHeader('Retry-After', String(blockedSeconds));
      throw new HttpException(
        'Te veel pogingen, probeer later opnieuw',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const org = await this.prisma.organization.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        primaryColor: true,
        chatEnabled: true,
        // PRD-13: workflow-vlaggen die de portal-UI voor álle stafrollen nodig
        // heeft (GET /organizations/:id is ORG_ADMIN-only) — zelfde precedent
        // als chatEnabled, niet gevoelig.
        inspectionReviewEnabled: true,
        aiReviewEnabled: true,
      },
    });
    if (!org) {
      // Tel alleen mislukte lookups (404); een geslaagde 200 hieronder niet.
      this.enumerationGuard.recordFailure(ip);
      throw new NotFoundException('Organisatie niet gevonden');
    }
    // Effectieve feature-keys meeleveren (PRD §5.1) zodat het klantportaal — dat
    // een eigen auth-realm heeft en `me/features` niet kan aanroepen — de gating
    // al vóór login (realm-onafhankelijk) kan toepassen.
    const features = await this.entitlements.getEnabledFeatures(org.id);
    return { success: true, data: { ...org, features } };
  }

  @Get('me/features')
  @ApiOperation({
    summary: 'Effectieve feature-keys van de eigen organisatie (frontend-bootstrap)',
  })
  @ApiResponse({ status: 200, description: 'Lijst van actieve feature-keys' })
  async myFeatures(@CurrentUser() user: User) {
    // SUPERUSER heeft geen org en impliciet alle features (guard-bypass) →
    // lever de volledige catalogus zodat de SU-UI niets verbergt.
    if (!user.orgId || user.roles.includes(Role.SUPERUSER)) {
      return { success: true, data: [...FEATURE_KEYS] };
    }
    const features = await this.entitlements.getEnabledFeatures(user.orgId);
    return { success: true, data: features };
  }

  @Get(':id/users')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Gebruikers van een organisatie ophalen (Superuser)' })
  @ApiResponse({ status: 200, description: 'Lijst van gebruikers' })
  async findUsers(@Param('id', ParseUUIDPipe) id: string) {
    const users = await this.organizationsService.findUsers(id);
    return { success: true, data: users };
  }

  @Get(':id/entitlements')
  @Roles(Role.SUPERUSER)
  @ApiOperation({
    summary: 'Entitlement-staat van een organisatie ophalen (Superuser)',
  })
  @ApiResponse({
    status: 200,
    description: 'Plan, plan-features, overrides, effectieve set + waarschuwingen',
  })
  async getEntitlements(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.organizationsService.getEntitlements(id);
    return { success: true, data };
  }

  // ─── IMP_PRD-10 Fase 5: Support-toegang ──────────────────
  // Geplaatst vóór de generieke `:id`-routes (scope-guard zit in de service).

  @Get(':id/support-access')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Status support-toegang' })
  @ApiResponse({ status: 200, description: 'Toggle-status + vervaltijd' })
  @ApiResponse({ status: 403, description: 'Geen toegang tot deze organisatie' })
  async getSupportAccess(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { success: true, data: await this.supportAccess.getStatus(user, id) };
  }

  @Patch(':id/support-access')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Support-toegang in-/uitschakelen (gelogd)' })
  @ApiResponse({ status: 200, description: 'Nieuwe toggle-status' })
  @ApiResponse({ status: 403, description: 'Geen toegang tot deze organisatie' })
  async setSupportAccess(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetSupportAccessDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return {
      success: true,
      data: await this.supportAccess.setAccess(user, id, dto, ip, userAgent),
    };
  }

  @Get(':id/support-access/logs')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Support-toegang logboek' })
  @ApiResponse({ status: 200, description: 'Gepagineerde logregels' })
  @ApiResponse({ status: 403, description: 'Geen toegang tot deze organisatie' })
  async supportAccessLogs(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      success: true,
      data: await this.supportAccess.listLogs(
        user,
        id,
        Number(page) || 1,
        Number(limit) || 20,
      ),
    };
  }

  @Get(':id')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Organisatie ophalen op ID' })
  @ApiResponse({ status: 200, description: 'Organisatie details' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    if (!user.roles.includes(Role.SUPERUSER) && user.orgId !== id) {
      throw new ForbiddenException('Geen toegang tot deze organisatie');
    }
    const org = await this.organizationsService.findOne(id);
    return { success: true, data: org };
  }

  @Patch(':id')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Organisatie instellingen bijwerken' })
  @ApiResponse({ status: 200, description: 'Organisatie bijgewerkt' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: User,
  ) {
    if (!user.roles.includes(Role.SUPERUSER) && user.orgId !== id) {
      throw new ForbiddenException('Geen toegang tot deze organisatie');
    }
    const org = await this.organizationsService.update(id, dto);
    return { success: true, data: org };
  }

  @Patch(':id/plan')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Abonnement toewijzen/ontkoppelen aan organisatie (Superuser)' })
  @ApiResponse({ status: 200, description: 'Entitlement-staat na wijziging' })
  @ApiResponse({ status: 404, description: 'Organisatie of abonnement niet gevonden' })
  async assignPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPlanDto,
  ) {
    const data = await this.organizationsService.assignPlan(id, dto.planId);
    return { success: true, data };
  }

  @Put(':id/features/:featureKey')
  @Roles(Role.SUPERUSER)
  @ApiOperation({
    summary: 'Per-org feature-override zetten/wissen (Superuser)',
  })
  @ApiResponse({ status: 200, description: 'Entitlement-staat na wijziging' })
  @ApiResponse({ status: 400, description: 'Onbekende feature-key' })
  async setFeatureOverride(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('featureKey') featureKey: string,
    @Body() dto: SetOrganizationFeatureDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.organizationsService.setFeatureOverride(
      id,
      featureKey,
      dto.state,
      user.id,
    );
    return { success: true, data };
  }

  @Post(':id/logo')
  @Roles(...ORG_ADMINS)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Logo uploaden voor organisatie' })
  @ApiResponse({ status: 200, description: 'Logo geüpload' })
  async uploadLogo(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ) {
    if (!user.roles.includes(Role.SUPERUSER) && user.orgId !== id) {
      throw new ForbiddenException('Geen toegang tot deze organisatie');
    }
    if (!file) {
      throw new NotFoundException('Geen bestand ontvangen');
    }
    const storageKey = await this.organizationsService.uploadLogo(id, file);
    return { success: true, data: { storageKey } };
  }

  @Public()
  @Get(':id/logo')
  @ApiOperation({ summary: 'Logo ophalen voor organisatie' })
  @ApiResponse({ status: 200, description: 'Logo afbeelding' })
  @ApiResponse({ status: 404, description: 'Geen logo gevonden' })
  async getLogo(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType } =
      await this.organizationsService.downloadLogo(id);
    res.set({
      'Content-Type': mimeType,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'public, max-age=86400',
    });
    res.send(buffer);
  }

  @Delete(':id/logo')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Logo verwijderen van organisatie' })
  @ApiResponse({ status: 200, description: 'Logo verwijderd' })
  async deleteLogo(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    if (!user.roles.includes(Role.SUPERUSER) && user.orgId !== id) {
      throw new ForbiddenException('Geen toegang tot deze organisatie');
    }
    await this.organizationsService.deleteLogo(id);
    return { success: true, data: null };
  }
}

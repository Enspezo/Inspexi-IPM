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
import { createHash } from 'crypto';
import { setBinaryResponseHeaders, ParseUuidPipe } from '@/common';
import { User, Role } from '@prisma/client';
import { ORG_ADMINS } from '@/common/auth/roles';
import { OrganizationsService } from './organizations.service';
import { UsersService } from '@/modules/users/users.service';
import { InviteUserDto } from '@/modules/users/dto';
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
    private usersService: UsersService,
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
    // B-511 §3: lookup vóór de blokkade-check — de branding van een bestaande
    // organisatie mag nooit collateral zijn van de enumeratieblokkade (gedeeld
    // kantoor-IP). Alleen écht onbekende slugs tellen mee en krijgen bij een
    // actieve blokkade een 429; een bestaande-maar-inactieve org geeft 404
    // (offboarding) zonder de per-IP-teller te raken. Deelt dezelfde teller
    // als TenantMiddleware, zodat beide enumeratie-vectoren samen tellen.
    const org = await this.prisma.organization.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        primaryColor: true,
        chatEnabled: true,
        isActive: true,
        // PRD-13: workflow-vlaggen die de portal-UI voor álle stafrollen nodig
        // heeft (GET /organizations/:id is ORG_ADMIN-only) — zelfde precedent
        // als chatEnabled, niet gevoelig.
        inspectionReviewEnabled: true,
        aiReviewEnabled: true,
      },
    });
    if (!org) {
      const blockedSeconds = this.enumerationGuard.isBlocked(ip);
      if (blockedSeconds > 0) {
        res.setHeader('Retry-After', String(blockedSeconds));
        throw new HttpException(
          'Te veel pogingen, probeer later opnieuw',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      // Tel alleen mislukte lookups van onbekende slugs.
      this.enumerationGuard.recordFailure(ip);
      throw new NotFoundException('Organisatie niet gevonden');
    }
    if (!org.isActive) {
      // Offboarding: inactieve orgs zijn publiek onzichtbaar, maar tellen niet
      // mee als enumeratie-failure (de slug bestaat immers).
      throw new NotFoundException('Organisatie niet gevonden');
    }
    // Effectieve feature-keys meeleveren (PRD §5.1) zodat het klantportaal — dat
    // een eigen auth-realm heeft en `me/features` niet kan aanroepen — de gating
    // al vóór login (realm-onafhankelijk) kan toepassen.
    const features = await this.entitlements.getEnabledFeatures(org.id);
    const { isActive: _isActive, ...publicOrg } = org;
    return { success: true, data: { ...publicOrg, features } };
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
  async findUsers(@Param('id', ParseUuidPipe) id: string) {
    const users = await this.organizationsService.findUsers(id);
    return { success: true, data: users };
  }

  @Post(':id/invite')
  @Roles(Role.SUPERUSER)
  @ApiOperation({
    summary:
      'Gebruiker uitnodigen voor een organisatie (Superuser-onboarding, WP-B3/B-504)',
  })
  @ApiResponse({ status: 201, description: 'Uitnodiging verstuurd' })
  @ApiResponse({ status: 404, description: 'Organisatie niet gevonden' })
  @ApiResponse({ status: 409, description: 'Gebruiker of uitnodiging bestaat al' })
  async inviteUser(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: InviteUserDto,
    @CurrentUser() user: User,
  ) {
    // Nette 404 vóór de invite-flow; daarna exact dezelfde invite-logica en
    // rolhiërarchie-check als POST /users/invite (B-504: eerste beheerder van
    // een verse organisatie uitnodigen vanaf het superuser-domein).
    await this.organizationsService.findOne(id);
    const invitation = await this.usersService.invite(id, dto, user);
    return { success: true, data: invitation };
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
  async getEntitlements(@Param('id', ParseUuidPipe) id: string) {
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
    @Param('id', ParseUuidPipe) id: string,
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
    @Param('id', ParseUuidPipe) id: string,
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
    @Param('id', ParseUuidPipe) id: string,
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
    @Param('id', ParseUuidPipe) id: string,
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
    @Param('id', ParseUuidPipe) id: string,
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
    @Param('id', ParseUuidPipe) id: string,
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
    @Param('id', ParseUuidPipe) id: string,
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
    @Param('id', ParseUuidPipe) id: string,
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
    @Param('id', ParseUuidPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, filename, disposition, storageKey } =
      await this.organizationsService.downloadLogo(id);
    // WP-B4: publieke route, dus altijd nosniff + sandbox-CSP + expliciete
    // disposition. Cache-Control was 24 uur op een URL die nooit verandert —
    // een kwaadaardig logo bleef daardoor een dag in caches hangen. De ETag
    // volgt de opslagsleutel (nieuwe UUID per upload), dus vervangen of
    // verwijderen breekt de cache-key meteen; de korte max-age begrenst het
    // venster waarin een client zonder revalidatie oude bytes toont.
    setBinaryResponseHeaders(res, {
      mimeType,
      contentLength: buffer.length,
      filename,
      disposition,
      cacheControl: 'public, max-age=300, must-revalidate',
      etag: `"${createHash('sha256').update(storageKey).digest('hex').slice(0, 32)}"`,
    });
    res.send(buffer);
  }

  @Delete(':id/logo')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Logo verwijderen van organisatie' })
  @ApiResponse({ status: 200, description: 'Logo verwijderd' })
  async deleteLogo(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    if (!user.roles.includes(Role.SUPERUSER) && user.orgId !== id) {
      throw new ForbiddenException('Geen toegang tot deze organisatie');
    }
    await this.organizationsService.deleteLogo(id);
    return { success: true, data: null };
  }
}

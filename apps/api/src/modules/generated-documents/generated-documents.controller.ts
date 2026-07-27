// Twee controllers: (1) authenticated lifecycle/export/sign; (2) PUBLIEK signature-requests
// (externe ondertekening via e-maillink) — @Public() + strikte rate-limit.

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  Ip,
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { User, DocumentType } from '@prisma/client';
import { Roles, CurrentUser, Public } from '@/common/decorators';
import { ALL_STAFF, REVIEW_ROLES } from '@/common/auth/roles';
import { GeneratedDocumentsService } from './generated-documents.service';
import { DocumentSigningService } from './document-signing.service';
import {
  GenerateDocumentDto,
  UpdateGeneratedDocumentDto,
  RequestSignatureDto,
  SignDocumentDto,
  PublicSignDto,
} from './dto';

// ── Rolmatrix documentketen (WP-A3 — B-101/B-102/B-103/B-104) ──────────────
// STAFF (= ALL_STAFF, incl. INSPECTEUR):
//   - genereren (generate-plan/-report), lezen, preview/export/download: de
//     INSPECTEUR stelt het rapport in de PWA op en moet het dus ook kunnen
//     genereren — dit is een bewuste keuze, geen omissie (B-103);
//   - PATCH (inhoud bewerken): route is STAFF, maar de service weigert zodra het
//     document FINALIZED is of er ≥1 SIGNED-handtekening staat (B-104);
//   - intern ondertekenen (sign): route is STAFF, maar de service valideert de
//     rolcode tegen de signer-roles-lookup en beperkt per stafrol — INSPECTEUR
//     → alleen INSPECTOR; REVIEW_ROLES → ook REVIEWER; klant-rollen (CLIENT,
//     INSTALLATION_RESPONSIBLE, …) uitsluitend via het publieke
//     ondertekenverzoek (B-101);
//   - ondertekenverzoek aanmaken (request-signature): STAFF.
// APPROVERS (= REVIEW_ROLES: SUPERUSER/ORG_ADMIN/MANAGER/WERKVOORBEREIDER):
//   - finalize én DELETE (B-102) — en verwijderen weigert bovendien in de
//     service zodra er ≥1 SIGNED-handtekening onder het document staat.
const STAFF = ALL_STAFF;
const APPROVERS = REVIEW_ROLES;

@ApiTags('Generated Documents')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller()
export class GeneratedDocumentsController {
  constructor(
    private readonly service: GeneratedDocumentsService,
    private readonly signing: DocumentSigningService,
  ) {}

  @Post('inspection-plans/:planId/generate-plan')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Inspectieplan-document genereren' })
  async generatePlan(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: User,
    @Body() _dto: GenerateDocumentDto,
  ) {
    return { success: true, data: await this.service.generateDocument(planId, DocumentType.PLAN, user) };
  }

  @Post('inspection-plans/:planId/generate-report')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Inspectierapport genereren' })
  async generateReport(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: User,
    @Body() _dto: GenerateDocumentDto,
  ) {
    return {
      success: true,
      data: await this.service.generateDocument(planId, DocumentType.REPORT, user),
    };
  }

  @Get('inspection-plans/:planId/documents')
  @Roles(...STAFF)
  async forPlan(@Param('planId', ParseUUIDPipe) planId: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findByInspectionPlan(planId, user) };
  }

  @Get('generated-documents/:id')
  @Roles(...STAFF)
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Patch('generated-documents/:id')
  @Roles(...STAFF)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateGeneratedDocumentDto,
  ) {
    if (!dto.editedContent) return { success: true, data: await this.service.findById(id, user) };
    return { success: true, data: await this.service.updateEditedContent(id, user, dto.editedContent) };
  }

  @Delete('generated-documents/:id')
  // B-102: verwijderen is gelijkgetrokken met finalize (APPROVERS) — de service
  // weigert daarnaast elk document met een reeds gezette handtekening.
  @Roles(...APPROVERS)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.service.delete(id, user);
    return { success: true };
  }

  @Post('generated-documents/:id/preview')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'PDF-preview (niet opgeslagen)' })
  async preview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.service.generatePreview(id, user);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="preview.pdf"' });
    return new StreamableFile(buffer);
  }

  @Post('generated-documents/:id/export-pdf')
  @Roles(...STAFF)
  async exportPdf(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: { pdfUrl: await this.service.exportToPdf(id, user) } };
  }

  @Post('generated-documents/:id/export-word')
  @Roles(...STAFF)
  async exportWord(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: { wordUrl: await this.service.exportToWord(id, user) } };
  }

  @Get('generated-documents/:id/html')
  @Roles(...STAFF)
  async html(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set({ 'Content-Type': 'text/html; charset=utf-8' });
    return await this.service.getHtmlContent(id, user);
  }

  @Get('generated-documents/:id/download')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Geëxporteerd bestand downloaden (format=pdf|word)' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
    @Query('format') format?: string,
  ): Promise<StreamableFile> {
    const fmt = format === 'word' ? 'word' : 'pdf';
    const { buffer, mimeType, filename } = await this.service.downloadFile(id, user, fmt);
    res.set({ 'Content-Type': mimeType, 'Content-Disposition': `attachment; filename="${filename}"` });
    return new StreamableFile(buffer);
  }

  @Post('generated-documents/:id/finalize')
  @Roles(...APPROVERS)
  async finalize(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.finalizeDocument(id, user) };
  }

  @Post('generated-documents/:id/request-signature')
  @Roles(...STAFF)
  async requestSignature(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RequestSignatureDto,
  ) {
    return { success: true, data: await this.signing.requestSignature(id, user, dto) };
  }

  @Post('generated-documents/:id/sign')
  // B-101: route blijft STAFF; de service dwingt de rolcode-validatie en de
  // stafrol→signer-rol-mapping af (zie rolmatrix bovenaan dit bestand).
  @Roles(...STAFF)
  async sign(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: SignDocumentDto,
    @Ip() ip: string,
  ) {
    return { success: true, data: await this.signing.signDocument(id, user, dto, ip) };
  }
}

// ── Publieke ondertekening (geen auth) ─────────────────────
@ApiTags('Signature Requests (public)')
@RequiresFeature('BASIS_INSPECTIES')
@Controller('signature-requests')
export class SignatureRequestsController {
  constructor(private readonly signing: DocumentSigningService) {}

  @Get(':requestId')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Ondertekenverzoek ophalen (publiek)' })
  async get(@Param('requestId', ParseUUIDPipe) requestId: string) {
    return { success: true, data: await this.signing.getSignatureRequest(requestId) };
  }

  @Post(':requestId/sign')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Document ondertekenen via publieke link' })
  // B-408 (WP-C2): juist het publieke kanaal (zwakste identiteitsvaststelling)
  // moet het IP vastleggen — @Ip() respecteert de trust-proxy-config uit main.ts
  // (WP-A3), identiek aan de staf- en klantportaal-ondertekenroutes.
  async sign(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: PublicSignDto,
    @Ip() ip: string,
  ) {
    await this.signing.signViaRequest(requestId, dto, ip);
    return { success: true };
  }
}

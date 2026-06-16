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
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { User, Role, DocumentType } from '@prisma/client';
import { Roles, CurrentUser, Public } from '@/common/decorators';
import { ALL_STAFF } from '@/common/auth/roles';
import { GeneratedDocumentsService } from './generated-documents.service';
import {
  GenerateDocumentDto,
  UpdateGeneratedDocumentDto,
  RequestSignatureDto,
  SignDocumentDto,
  PublicSignDto,
} from './dto';

const STAFF = ALL_STAFF;
const APPROVERS = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.WERKVOORBEREIDER] as const;

@ApiTags('Generated Documents')
@ApiBearerAuth()
@Controller()
export class GeneratedDocumentsController {
  constructor(private readonly service: GeneratedDocumentsService) {}

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
  @Roles(...STAFF)
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
    return { success: true, data: await this.service.requestSignature(id, user, dto) };
  }

  @Post('generated-documents/:id/sign')
  @Roles(...STAFF)
  async sign(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: SignDocumentDto,
  ) {
    return { success: true, data: await this.service.signDocument(id, user, dto) };
  }
}

// ── Publieke ondertekening (geen auth) ─────────────────────
@ApiTags('Signature Requests (public)')
@Controller('signature-requests')
export class SignatureRequestsController {
  constructor(private readonly service: GeneratedDocumentsService) {}

  @Get(':requestId')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Ondertekenverzoek ophalen (publiek)' })
  async get(@Param('requestId', ParseUUIDPipe) requestId: string) {
    return { success: true, data: await this.service.getSignatureRequest(requestId) };
  }

  @Post(':requestId/sign')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Document ondertekenen via publieke link' })
  async sign(@Param('requestId', ParseUUIDPipe) requestId: string, @Body() dto: PublicSignDto) {
    await this.service.signViaRequest(requestId, dto);
    return { success: true };
  }
}

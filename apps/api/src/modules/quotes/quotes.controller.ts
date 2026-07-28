import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  Res,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { User, QuoteStatus } from '@prisma/client';
import { ALL_STAFF, CRM_ROLES, MANAGEMENT_ROLES, OFFICE_ROLES } from '@/common/auth/roles';
import { setBinaryResponseHeaders, sanitizeDispositionFilename } from '@/common';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { TenantContext } from '@/common/interfaces/tenant-context.interface';
import { QuotesService } from './quotes.service';
import { QuoteApprovalsService } from './quote-approvals.service';
import { QuoteQuestionsService } from './quote-questions.service';
import { QuoteAttachmentsService } from './quote-attachments.service';
import { QuotePdfService } from './quote-pdf.service';
import { QuotePublicService } from './quote-public.service';
import {
  CreateQuoteDto,
  UpdateQuoteDto,
  SetQuoteLinesDto,
  ListQuotesQueryDto,
  SubmitApprovalDto,
  ApproveQuoteDto,
  RejectQuoteDto,
  RequestTeamApprovalDto,
  RequestPersonApprovalDto,
  ReviewVoluntaryApprovalDto,
  SendQuoteDto,
  AddQuestionDto,
  SignQuoteDto,
} from './dto';
import { ParseUuidPipe } from '@/common';

@ApiTags('quotes')
@RequiresFeature('CRM_COMPLEET')
@Controller('quotes')
export class QuotesController {
  constructor(
    private readonly service: QuotesService,
    private readonly approvalsService: QuoteApprovalsService,
    private readonly questionsService: QuoteQuestionsService,
    private readonly attachmentsService: QuoteAttachmentsService,
    private readonly quotePdfService: QuotePdfService,
  ) {}

  // ─── Resolve price (must be before :id routes) ────────
  @Get('resolve-price')
  @ApiOperation({ summary: 'Prijs voor product/contact/aantal opzoeken' })
  @Roles(...OFFICE_ROLES)
  async resolvePrice(
    @CurrentUser() user: User,
    @Query('productId', ParseUuidPipe) productId: string,
    @Query('contactId', ParseUuidPipe) contactId: string,
    @Query('quantity') quantity: string,
  ) {
    const data = await this.service.resolvePrice(productId, contactId, parseFloat(quantity) || 1, user);
    return { success: true, data };
  }

  // ─── List & Create ────────────────────────────────────
  @Get()
  @ApiOperation({ summary: 'Offertes ophalen (gepagineerd)' })
  @Roles(...CRM_ROLES)
  async findAll(@CurrentUser() user: User, @Query() query: ListQuotesQueryDto) {
    const data = await this.service.findAll(user, query);
    return { success: true, data };
  }

  @Post()
  @ApiOperation({ summary: 'Nieuwe offerte aanmaken' })
  @Roles(...OFFICE_ROLES)
  async create(@CurrentUser() user: User, @Body() dto: CreateQuoteDto) {
    const data = await this.service.create(dto, user);
    return { success: true, data };
  }

  // ─── Detail ───────────────────────────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Offerte ophalen' })
  @Roles(...CRM_ROLES)
  async findOne(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string) {
    const data = await this.service.findOne(id, user);
    return { success: true, data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Offerte bijwerken' })
  @Roles(...OFFICE_ROLES)
  async update(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string, @Body() dto: UpdateQuoteDto) {
    const data = await this.service.update(id, dto, user);
    return { success: true, data };
  }

  @Put(':id/lines')
  @ApiOperation({ summary: 'Offerteregels vervangen' })
  @Roles(...OFFICE_ROLES)
  async setLines(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string, @Body() dto: SetQuoteLinesDto) {
    const data = await this.service.setLines(id, dto, user);
    return { success: true, data };
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Offertestatus bijwerken' })
  @Roles(...OFFICE_ROLES)
  async updateStatus(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string, @Body('status') status: QuoteStatus) {
    const data = await this.service.updateStatus(id, status, user);
    return { success: true, data };
  }

  // ─── Send ─────────────────────────────────────────────
  @Post(':id/send')
  @ApiOperation({ summary: 'Offerte versturen naar klant' })
  @Roles(...OFFICE_ROLES)
  async sendQuote(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string, @Body() dto: SendQuoteDto) {
    const data = await this.service.sendQuote(id, dto, user);
    return { success: true, data };
  }

  // ─── Approval ─────────────────────────────────────────
  @Post(':id/submit-approval')
  @ApiOperation({ summary: 'Offerte ter goedkeuring indienen' })
  @Roles(...OFFICE_ROLES)
  async submitForApproval(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string, @Body() dto: SubmitApprovalDto) {
    const data = await this.approvalsService.submitForApproval(id, dto, user);
    return { success: true, data };
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Offerte goedkeuren' })
  @Roles(...MANAGEMENT_ROLES)
  async approve(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string, @Body() dto: ApproveQuoteDto) {
    const data = await this.approvalsService.approve(id, dto, user);
    return { success: true, data };
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Offerte afwijzen' })
  @Roles(...MANAGEMENT_ROLES)
  async reject(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string, @Body() dto: RejectQuoteDto) {
    const data = await this.approvalsService.reject(id, dto, user);
    return { success: true, data };
  }

  // ─── Vrijwillige goedkeuring (adviserend; blokkeert versturen niet) ─────
  @Post(':id/voluntary-approval/team')
  @ApiOperation({ summary: 'Vrijwillig goedkeuring vragen aan eigen team' })
  @Roles(...OFFICE_ROLES)
  async requestTeamApproval(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string, @Body() dto: RequestTeamApprovalDto) {
    const data = await this.approvalsService.requestTeamApproval(id, dto, user);
    return { success: true, data };
  }

  @Post(':id/voluntary-approval/person')
  @ApiOperation({ summary: 'Vrijwillig goedkeuring vragen aan een specifieke persoon' })
  @Roles(...OFFICE_ROLES)
  async requestPersonApproval(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string, @Body() dto: RequestPersonApprovalDto) {
    const data = await this.approvalsService.requestPersonApproval(id, dto, user);
    return { success: true, data };
  }

  @Post(':id/approval-requests/:requestId/approve')
  @ApiOperation({ summary: 'Vrijwillig goedkeuringsverzoek goedkeuren (geen statuswijziging)' })
  @Roles(...ALL_STAFF)
  async approveVoluntary(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string, @Param('requestId', ParseUuidPipe) requestId: string, @Body() dto: ReviewVoluntaryApprovalDto) {
    const data = await this.approvalsService.reviewVoluntary(id, requestId, true, dto, user);
    return { success: true, data };
  }

  @Post(':id/approval-requests/:requestId/reject')
  @ApiOperation({ summary: 'Vrijwillig goedkeuringsverzoek afwijzen (geen statuswijziging)' })
  @Roles(...ALL_STAFF)
  async rejectVoluntary(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string, @Param('requestId', ParseUuidPipe) requestId: string, @Body() dto: ReviewVoluntaryApprovalDto) {
    const data = await this.approvalsService.reviewVoluntary(id, requestId, false, dto, user);
    return { success: true, data };
  }

  @Post(':id/approval-requests/:requestId/cancel')
  @ApiOperation({ summary: 'Eigen vrijwillig goedkeuringsverzoek intrekken' })
  @Roles(...ALL_STAFF)
  async cancelVoluntary(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string, @Param('requestId', ParseUuidPipe) requestId: string) {
    const data = await this.approvalsService.cancelVoluntary(id, requestId, user);
    return { success: true, data };
  }

  // ─── Q&A (medewerker) ─────────────────────────────────
  @Get(':id/questions')
  @ApiOperation({ summary: 'Vragen bij offerte ophalen' })
  @Roles(...OFFICE_ROLES)
  async getQuestions(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string) {
    const data = await this.questionsService.getQuestions(id, user);
    return { success: true, data };
  }

  @Post(':id/questions')
  @ApiOperation({ summary: 'Vraag bij offerte toevoegen' })
  @Roles(...OFFICE_ROLES)
  async addQuestion(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string, @Body() dto: AddQuestionDto) {
    const data = await this.questionsService.addQuestion(id, dto, user);
    return { success: true, data };
  }

  @Post(':id/questions/:questionId/answer')
  @ApiOperation({ summary: 'Klantvraag beantwoorden' })
  @Roles(...OFFICE_ROLES)
  async answerQuestion(
    @CurrentUser() user: User,
    @Param('id', ParseUuidPipe) id: string,
    @Param('questionId', ParseUuidPipe) questionId: string,
    @Body() dto: AddQuestionDto,
  ) {
    const data = await this.questionsService.answerClientQuestion(id, questionId, dto, user);
    return { success: true, data };
  }

  // ─── Bijlagen ─────────────────────────────────────────
  @Get(':id/attachments')
  @ApiOperation({ summary: 'Bijlagen bij offerte ophalen' })
  @Roles(...OFFICE_ROLES)
  async getAttachments(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string) {
    const data = await this.attachmentsService.getAttachments(id, user);
    return { success: true, data };
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Bijlage bij offerte uploaden' })
  @Roles(...OFFICE_ROLES)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async uploadAttachment(
    @CurrentUser() user: User,
    @Param('id', ParseUuidPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this.attachmentsService.uploadAttachment(id, file, user);
    return { success: true, data };
  }

  @Get(':id/attachments/:attachmentId/download')
  @ApiOperation({ summary: 'Bijlage downloaden' })
  @Roles(...CRM_ROLES)
  async downloadAttachment(
    @CurrentUser() user: User,
    @Param('id', ParseUuidPipe) id: string,
    @Param('attachmentId', ParseUuidPipe) attachmentId: string,
    @Res() res: Response,
  ) {
    const { buffer, attachment } = await this.attachmentsService.downloadAttachment(id, attachmentId, user);
    setBinaryResponseHeaders(res, {
      mimeType: attachment.mimeType,
      contentLength: buffer.length,
      filename: sanitizeDispositionFilename(attachment.fileName),
      disposition: 'attachment',
      cacheControl: 'private, no-store',
    });
    res.send(buffer);
  }

  @Delete(':id/attachments/:attachmentId')
  @ApiOperation({ summary: 'Bijlage verwijderen' })
  @Roles(...OFFICE_ROLES)
  async deleteAttachment(
    @CurrentUser() user: User,
    @Param('id', ParseUuidPipe) id: string,
    @Param('attachmentId', ParseUuidPipe) attachmentId: string,
  ) {
    const data = await this.attachmentsService.deleteAttachment(id, attachmentId, user);
    return { success: true, data };
  }

  // ─── PDF ──────────────────────────────────────────────
  @Get(':id/preview-pdf')
  @ApiOperation({ summary: 'Offerte-PDF preview genereren' })
  @Roles(...OFFICE_ROLES)
  async previewPdf(
    @CurrentUser() user: User,
    @Param('id', ParseUuidPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, quoteNumber } = await this.quotePdfService.renderQuotePdf(id, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Preview-${quoteNumber}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Offerte-PDF downloaden' })
  @Roles(...OFFICE_ROLES)
  async downloadPdf(
    @CurrentUser() user: User,
    @Param('id', ParseUuidPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, quoteNumber } = await this.quotePdfService.generatePdf(id, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Offerte-${quoteNumber}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  // ─── Delete ───────────────────────────────────────────
  @Delete(':id')
  @ApiOperation({ summary: 'Offerte verwijderen (soft delete)' })
  @Roles(...MANAGEMENT_ROLES)
  async remove(@CurrentUser() user: User, @Param('id', ParseUuidPipe) id: string) {
    const data = await this.service.remove(id, user);
    return { success: true, data };
  }
}

// ─── Public controller (geen auth vereist) ─────────────
//
// WP-B7 (B-152): bewust GEEN klasse-brede @RequiresFeature meer — de guard zou
// de entitlement tegen de BEZOEKENDE tenant evalueren i.p.v. tegen de eigenaar
// van de offerte. De feature-gate zit nu in de services, tegen `quote.orgId`.
// Elke handler injecteert @CurrentTenant() zodat de services de token-lookup aan
// het bezochte subdomein kunnen binden (zie `publicTenantWhere` in @/common).

@ApiTags('public-quotes')
@Controller('public/quotes')
export class PublicQuotesController {
  constructor(
    private readonly publicService: QuotePublicService,
    private readonly questionsService: QuoteQuestionsService,
    private readonly attachmentsService: QuoteAttachmentsService,
    private readonly quotePdfService: QuotePdfService,
  ) {}

  @Get(':token')
  @ApiOperation({ summary: 'Offerte ophalen via publieke token' })
  @Public()
  async getByToken(@Param('token') token: string, @CurrentTenant() tenant: TenantContext) {
    const data = await this.publicService.findByPublicToken(token, tenant);
    return { success: true, data };
  }

  @Get(':token/pdf')
  @ApiOperation({ summary: 'Offerte-PDF via publieke token' })
  @Public()
  async downloadPdf(
    @Param('token') token: string,
    @CurrentTenant() tenant: TenantContext,
    @Res() res: Response,
  ) {
    const { buffer, quoteNumber } = await this.quotePdfService.downloadPublicPdf(token, tenant);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Offerte-${quoteNumber}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Post(':token/questions')
  @ApiOperation({ summary: 'Klantvraag stellen via publieke token' })
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async addQuestion(
    @Param('token') token: string,
    @Body() dto: AddQuestionDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    const data = await this.questionsService.addClientQuestion(token, dto, tenant);
    return { success: true, data };
  }

  @Post(':token/sign')
  @ApiOperation({ summary: 'Offerte ondertekenen via publieke token' })
  @Public()
  @HttpCode(HttpStatus.OK)
  async sign(
    @Param('token') token: string,
    @Body() dto: SignQuoteDto,
    @CurrentTenant() tenant: TenantContext,
    @Req() req: Request,
  ) {
    const clientIp = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const data = await this.publicService.signQuote(token, dto, tenant, clientIp, userAgent);
    return { success: true, data };
  }

  @Get(':token/attachments/:attachmentId/download')
  @ApiOperation({ summary: 'Bijlage downloaden via publieke token' })
  @Public()
  async downloadAttachment(
    @Param('token') token: string,
    @Param('attachmentId', ParseUuidPipe) attachmentId: string,
    @CurrentTenant() tenant: TenantContext,
    @Res() res: Response,
  ) {
    const { buffer, attachment } = await this.attachmentsService.downloadPublicAttachment(
      token,
      attachmentId,
      tenant,
    );
    // Publieke route: bijlagen van vóór de upload-whitelist kunnen elk type
    // bevatten — attachment + nosniff + sandbox houden ze inert (WP-B4).
    // De tenantbinding (WP-B7/B-152) zit in downloadPublicAttachment zelf.
    setBinaryResponseHeaders(res, {
      mimeType: attachment.mimeType,
      contentLength: buffer.length,
      filename: sanitizeDispositionFilename(attachment.fileName),
      disposition: 'attachment',
      cacheControl: 'private, no-store',
    });
    res.send(buffer);
  }
}

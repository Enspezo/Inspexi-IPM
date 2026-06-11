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
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  Res,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { User, Role, QuoteStatus } from '@prisma/client';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { QuotesService } from './quotes.service';
import {
  CreateQuoteDto,
  UpdateQuoteDto,
  SetQuoteLinesDto,
  ListQuotesQueryDto,
  SubmitApprovalDto,
  ApproveQuoteDto,
  RejectQuoteDto,
  SendQuoteDto,
  AddQuestionDto,
  SignQuoteDto,
} from './dto';

@ApiTags('quotes')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly service: QuotesService) {}

  // ─── Resolve price (must be before :id routes) ────────
  @Get('resolve-price')
  @ApiOperation({ summary: 'Prijs voor product/contact/aantal opzoeken' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async resolvePrice(
    @CurrentUser() user: User,
    @Query('productId', ParseUUIDPipe) productId: string,
    @Query('contactId', ParseUUIDPipe) contactId: string,
    @Query('quantity') quantity: string,
  ) {
    const data = await this.service.resolvePrice(productId, contactId, parseFloat(quantity) || 1, user);
    return { success: true, data };
  }

  // ─── List & Create ────────────────────────────────────
  @Get()
  @ApiOperation({ summary: 'Offertes ophalen (gepagineerd)' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE, Role.WERKVOORBEREIDER)
  async findAll(@CurrentUser() user: User, @Query() query: ListQuotesQueryDto) {
    const data = await this.service.findAll(user, query);
    return { success: true, data };
  }

  @Post()
  @ApiOperation({ summary: 'Nieuwe offerte aanmaken' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async create(@CurrentUser() user: User, @Body() dto: CreateQuoteDto) {
    const data = await this.service.create(dto, user);
    return { success: true, data };
  }

  // ─── Detail ───────────────────────────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Offerte ophalen' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE, Role.WERKVOORBEREIDER)
  async findOne(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.findOne(id, user);
    return { success: true, data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Offerte bijwerken' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async update(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuoteDto) {
    const data = await this.service.update(id, dto, user);
    return { success: true, data };
  }

  @Put(':id/lines')
  @ApiOperation({ summary: 'Offerteregels vervangen' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async setLines(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetQuoteLinesDto) {
    const data = await this.service.setLines(id, dto, user);
    return { success: true, data };
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Offertestatus bijwerken' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async updateStatus(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body('status') status: QuoteStatus) {
    const data = await this.service.updateStatus(id, status, user);
    return { success: true, data };
  }

  // ─── Send ─────────────────────────────────────────────
  @Post(':id/send')
  @ApiOperation({ summary: 'Offerte versturen naar klant' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async sendQuote(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendQuoteDto) {
    const data = await this.service.sendQuote(id, dto, user);
    return { success: true, data };
  }

  // ─── Approval ─────────────────────────────────────────
  @Post(':id/submit-approval')
  @ApiOperation({ summary: 'Offerte ter goedkeuring indienen' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async submitForApproval(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitApprovalDto) {
    const data = await this.service.submitForApproval(id, dto, user);
    return { success: true, data };
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Offerte goedkeuren' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER)
  async approve(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveQuoteDto) {
    const data = await this.service.approve(id, dto, user);
    return { success: true, data };
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Offerte afwijzen' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER)
  async reject(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectQuoteDto) {
    const data = await this.service.reject(id, dto, user);
    return { success: true, data };
  }

  // ─── Q&A (medewerker) ─────────────────────────────────
  @Get(':id/questions')
  @ApiOperation({ summary: 'Vragen bij offerte ophalen' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async getQuestions(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.getQuestions(id, user);
    return { success: true, data };
  }

  @Post(':id/questions')
  @ApiOperation({ summary: 'Vraag bij offerte toevoegen' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async addQuestion(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddQuestionDto) {
    const data = await this.service.addQuestion(id, dto, user);
    return { success: true, data };
  }

  @Post(':id/questions/:questionId/answer')
  @ApiOperation({ summary: 'Klantvraag beantwoorden' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async answerQuestion(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: AddQuestionDto,
  ) {
    const data = await this.service.answerClientQuestion(id, questionId, dto, user);
    return { success: true, data };
  }

  // ─── Bijlagen ─────────────────────────────────────────
  @Get(':id/attachments')
  @ApiOperation({ summary: 'Bijlagen bij offerte ophalen' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async getAttachments(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.getAttachments(id, user);
    return { success: true, data };
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Bijlage bij offerte uploaden' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async uploadAttachment(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this.service.uploadAttachment(id, file, user);
    return { success: true, data };
  }

  @Get(':id/attachments/:attachmentId/download')
  @ApiOperation({ summary: 'Bijlage downloaden' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE, Role.WERKVOORBEREIDER)
  async downloadAttachment(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() res: Response,
  ) {
    const { buffer, attachment } = await this.service.downloadAttachment(id, attachmentId, user);
    res.set({ 'Content-Type': attachment.mimeType, 'Content-Disposition': `attachment; filename="${attachment.fileName}"`, 'Content-Length': buffer.length });
    res.send(buffer);
  }

  @Delete(':id/attachments/:attachmentId')
  @ApiOperation({ summary: 'Bijlage verwijderen' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async deleteAttachment(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    const data = await this.service.deleteAttachment(id, attachmentId, user);
    return { success: true, data };
  }

  // ─── PDF ──────────────────────────────────────────────
  @Get(':id/preview-pdf')
  @ApiOperation({ summary: 'Offerte-PDF preview genereren' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async previewPdf(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, quoteNumber } = await this.service.renderQuotePdf(id, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Preview-${quoteNumber}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Offerte-PDF downloaden' })
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async downloadPdf(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, quoteNumber } = await this.service.generatePdf(id, user);
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER)
  async remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.remove(id, user);
    return { success: true, data };
  }
}

// ─── Public controller (geen auth vereist) ─────────────

@ApiTags('public-quotes')
@Controller('public/quotes')
export class PublicQuotesController {
  constructor(private readonly service: QuotesService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Offerte ophalen via publieke token' })
  @Public()
  async getByToken(@Param('token') token: string) {
    const data = await this.service.findByPublicToken(token);
    return { success: true, data };
  }

  @Get(':token/pdf')
  @ApiOperation({ summary: 'Offerte-PDF via publieke token' })
  @Public()
  async downloadPdf(@Param('token') token: string, @Res() res: Response) {
    const { buffer, quoteNumber } = await this.service.downloadPublicPdf(token);
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
  async addQuestion(@Param('token') token: string, @Body() dto: AddQuestionDto) {
    const data = await this.service.addClientQuestion(token, dto);
    return { success: true, data };
  }

  @Post(':token/sign')
  @ApiOperation({ summary: 'Offerte ondertekenen via publieke token' })
  @Public()
  @HttpCode(HttpStatus.OK)
  async sign(@Param('token') token: string, @Body() dto: SignQuoteDto, @Req() req: Request) {
    const clientIp = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const data = await this.service.signQuote(token, dto, clientIp, userAgent);
    return { success: true, data };
  }

  @Get(':token/attachments/:attachmentId/download')
  @ApiOperation({ summary: 'Bijlage downloaden via publieke token' })
  @Public()
  async downloadAttachment(
    @Param('token') token: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() res: Response,
  ) {
    const { buffer, attachment } = await this.service.downloadPublicAttachment(token, attachmentId);
    res.set({ 'Content-Type': attachment.mimeType, 'Content-Disposition': `attachment; filename="${attachment.fileName}"`, 'Content-Length': buffer.length });
    res.send(buffer);
  }
}

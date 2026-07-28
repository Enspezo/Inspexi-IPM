import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  ParseUUIDPipe,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { User, EmailTemplateType } from '@prisma/client';
import { ORG_ADMINS } from '@/common/auth/roles';
import { setBinaryResponseHeaders, sanitizeDispositionFilename } from '@/common';
import type { Response } from 'express';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { EmailTemplatesService } from './email-templates.service';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';

@ApiTags('email-templates')
@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private readonly service: EmailTemplatesService) {}

  @Get()
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Lijst alle e-mailsjablonen' })
  async findAll(
    @CurrentUser() user: User,
    @Query('search') search?: string,
    @Query('type') type?: EmailTemplateType,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.service.findAll(user, {
      search,
      type,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
    return { success: true, data };
  }

  @Get('types')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Alle sjabloontypen met beschikbare placeholders' })
  async getTypes() {
    const data = this.service.getTypes();
    return { success: true, data };
  }

  @Post('preview')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Preview sjabloon met voorbeelddata' })
  async preview(
    @Body() body: { subject: string; bodyHtml: string; type: EmailTemplateType },
  ) {
    const data = this.service.preview(body);
    return { success: true, data };
  }

  // ── Attachments (before :id to avoid route conflicts) ──

  @Get(':id/attachments')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Bijlagen van e-mailsjabloon ophalen' })
  async getAttachments(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.getAttachments(id, user);
    return { success: true, data };
  }

  @Post(':id/attachments')
  @Roles(...ORG_ADMINS)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Bijlage toevoegen aan e-mailsjabloon' })
  async uploadAttachment(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Geen bestand geüpload');
    const data = await this.service.uploadAttachment(id, file, user);
    return { success: true, data };
  }

  @Get(':id/attachments/:attachmentId/download')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Bijlage downloaden' })
  async downloadAttachment(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() res: Response,
  ) {
    const { buffer, attachment } = await this.service.downloadAttachment(id, attachmentId, user);
    setBinaryResponseHeaders(res, {
      mimeType: attachment.mimeType,
      contentLength: buffer.length,
      filename: sanitizeDispositionFilename(attachment.originalName),
      disposition: 'attachment',
      cacheControl: 'private, no-store',
    });
    res.send(buffer);
  }

  @Delete(':id/attachments/:attachmentId')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Bijlage verwijderen' })
  async deleteAttachment(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    await this.service.deleteAttachment(id, attachmentId, user);
    return { success: true };
  }

  @Get(':id')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'E-mailsjabloon details' })
  async findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.findOne(id, user);
    return { success: true, data };
  }

  @Post()
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Nieuw e-mailsjabloon aanmaken' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateEmailTemplateDto,
  ) {
    const data = await this.service.create(dto, user);
    return { success: true, data };
  }

  @Post(':id/duplicate')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'E-mailsjabloon dupliceren' })
  async duplicate(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.duplicate(id, user);
    return { success: true, data };
  }

  @Patch(':id')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'E-mailsjabloon bijwerken' })
  async update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    const data = await this.service.update(id, dto, user);
    return { success: true, data };
  }

  @Delete(':id')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'E-mailsjabloon deactiveren' })
  async deactivate(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.deactivate(id, user);
    return { success: true, data };
  }
}

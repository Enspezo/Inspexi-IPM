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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { OFFICE_ROLES, ORG_ADMINS } from '@/common/auth/roles';
import { Response } from 'express';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { QuoteTemplatesService } from './quote-templates.service';
import {
  CreateQuoteTemplateDto,
  UpdateQuoteTemplateDto,
  ListQuoteTemplatesQueryDto,
  CreateFollowUpDto,
  UpdateFollowUpDto,
} from './dto';

@ApiTags('quote-templates')
@Controller('quote-templates')
export class QuoteTemplatesController {
  constructor(private readonly service: QuoteTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'Offertesjablonen ophalen' })
  @Roles(...OFFICE_ROLES)
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListQuoteTemplatesQueryDto,
  ) {
    const data = await this.service.findAll(user, query);
    return { success: true, data };
  }

  @Post()
  @ApiOperation({ summary: 'Nieuw offertesjabloon aanmaken' })
  @Roles(...ORG_ADMINS)
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateQuoteTemplateDto,
  ) {
    const data = await this.service.create(dto, user);
    return { success: true, data };
  }

  // ── DOCX file management ──────────────────────────────────

  @Post(':id/docx')
  @ApiOperation({ summary: 'DOCX-sjabloon uploaden' })
  @Roles(...ORG_ADMINS)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async uploadDocx(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Geen bestand geüpload');
    }
    const data = await this.service.uploadDocx(id, file, user);
    return { success: true, data };
  }

  @Get(':id/docx/download')
  @ApiOperation({ summary: 'DOCX-sjabloon downloaden' })
  @Roles(...OFFICE_ROLES)
  async downloadDocx(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName, mimeType } =
      await this.service.downloadDocx(id, user);
    res.set('Content-Type', mimeType);
    res.set(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );
    res.send(buffer);
  }

  @Get(':id/docx/revisions')
  @ApiOperation({ summary: 'DOCX-revisies ophalen' })
  @Roles(...OFFICE_ROLES)
  async getDocxRevisions(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.getDocxRevisions(id, user);
    return { success: true, data };
  }

  @Get(':id/docx/revisions/:revisionId/download')
  @ApiOperation({ summary: 'DOCX-revisie downloaden' })
  @Roles(...OFFICE_ROLES)
  async downloadDocxRevision(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName, mimeType } =
      await this.service.downloadDocxRevision(id, revisionId, user);
    res.set('Content-Type', mimeType);
    res.set(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );
    res.send(buffer);
  }

  // ── Image upload for block editor ────────────────────────

  @Post(':id/images')
  @ApiOperation({ summary: 'Afbeelding bij sjabloon uploaden' })
  @Roles(...ORG_ADMINS)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async uploadImage(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Geen bestand geüpload');
    }
    const data = await this.service.uploadImage(id, file, user);
    return { success: true, data };
  }

  @Get(':id/images/:key(*)')
  @ApiOperation({ summary: 'Sjabloonafbeelding ophalen' })
  @Roles(...OFFICE_ROLES)
  async getImage(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('key') key: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.getImage(id, key, user);
    const ext = key.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      svg: 'image/svg+xml',
      webp: 'image/webp',
    };
    res.set('Content-Type', mimeMap[ext ?? ''] ?? 'application/octet-stream');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  }

  // ── Template attachments ─────────────────────────────────

  @Get(':id/attachments')
  @ApiOperation({ summary: 'Standaardbijlagen ophalen' })
  @Roles(...OFFICE_ROLES)
  async getAttachments(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.getAttachments(id, user);
    return { success: true, data };
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Standaardbijlage uploaden' })
  @Roles(...ORG_ADMINS)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async uploadAttachment(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Geen bestand geüpload');
    }
    const data = await this.service.uploadAttachment(id, file, user);
    return { success: true, data };
  }

  @Patch(':id/attachments/reorder')
  @ApiOperation({ summary: 'Standaardbijlagen herordenen' })
  @Roles(...ORG_ADMINS)
  async reorderAttachments(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { attachmentIds: string[] },
  ) {
    const data = await this.service.reorderAttachments(
      id,
      body.attachmentIds,
      user,
    );
    return { success: true, data };
  }

  @Get(':id/attachments/:attachmentId/download')
  @ApiOperation({ summary: 'Standaardbijlage downloaden' })
  @Roles(...OFFICE_ROLES)
  async downloadAttachment(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() res: Response,
  ) {
    const { buffer, attachment } = await this.service.downloadAttachment(
      id,
      attachmentId,
      user,
    );
    res.set('Content-Type', attachment.mimeType);
    res.set(
      'Content-Disposition',
      `attachment; filename="${attachment.fileName}"`,
    );
    res.send(buffer);
  }

  @Delete(':id/attachments/:attachmentId')
  @ApiOperation({ summary: 'Standaardbijlage verwijderen' })
  @Roles(...ORG_ADMINS)
  async deleteAttachment(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    await this.service.deleteAttachment(id, attachmentId, user);
    return { success: true };
  }

  // ── Follow-up rules ──────────────────────────────────────

  @Get(':id/follow-ups')
  @ApiOperation({ summary: 'Follow-up regels ophalen' })
  @Roles(...OFFICE_ROLES)
  async getFollowUpRules(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.getFollowUpRules(id, user);
    return { success: true, data };
  }

  @Post(':id/follow-ups')
  @ApiOperation({ summary: 'Follow-up regel toevoegen' })
  @Roles(...ORG_ADMINS)
  async createFollowUp(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateFollowUpDto,
  ) {
    const data = await this.service.createFollowUp(id, dto, user);
    return { success: true, data };
  }

  @Patch(':id/follow-ups/:followUpId')
  @ApiOperation({ summary: 'Follow-up regel bijwerken' })
  @Roles(...ORG_ADMINS)
  async updateFollowUp(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('followUpId', ParseUUIDPipe) followUpId: string,
    @Body() dto: UpdateFollowUpDto,
  ) {
    const data = await this.service.updateFollowUp(id, followUpId, dto, user);
    return { success: true, data };
  }

  @Delete(':id/follow-ups/:followUpId')
  @ApiOperation({ summary: 'Follow-up regel verwijderen' })
  @Roles(...ORG_ADMINS)
  async deleteFollowUp(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('followUpId', ParseUUIDPipe) followUpId: string,
  ) {
    await this.service.deleteFollowUp(id, followUpId, user);
    return { success: true };
  }

  // ── Base CRUD (specific routes ABOVE :id) ────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Offertesjabloon ophalen' })
  @Roles(...OFFICE_ROLES)
  async findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.findOne(id, user);
    return { success: true, data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Offertesjabloon bijwerken' })
  @Roles(...ORG_ADMINS)
  async update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuoteTemplateDto,
  ) {
    const data = await this.service.update(id, dto, user);
    return { success: true, data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Offertesjabloon verwijderen (soft delete)' })
  @Roles(...ORG_ADMINS)
  async deactivate(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.deactivate(id, user);
    return { success: true, data };
  }
}

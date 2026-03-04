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
import { ApiTags, ApiConsumes } from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListQuoteTemplatesQueryDto,
  ) {
    const data = await this.service.findAll(user, query);
    return { success: true, data };
  }

  @Post()
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateQuoteTemplateDto,
  ) {
    const data = await this.service.create(dto, user);
    return { success: true, data };
  }

  // ── DOCX file management ──────────────────────────────────

  @Post(':id/docx')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async getDocxRevisions(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.getDocxRevisions(id, user);
    return { success: true, data };
  }

  @Get(':id/docx/revisions/:revisionId/download')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async getAttachments(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.getAttachments(id, user);
    return { success: true, data };
  }

  @Post(':id/attachments')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async getFollowUpRules(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.getFollowUpRules(id, user);
    return { success: true, data };
  }

  @Post(':id/follow-ups')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  async createFollowUp(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateFollowUpDto,
  ) {
    const data = await this.service.createFollowUp(id, dto, user);
    return { success: true, data };
  }

  @Patch(':id/follow-ups/:followUpId')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.findOne(id, user);
    return { success: true, data };
  }

  @Patch(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  async update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuoteTemplateDto,
  ) {
    const data = await this.service.update(id, dto, user);
    return { success: true, data };
  }

  @Delete(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  async deactivate(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.deactivate(id, user);
    return { success: true, data };
  }
}

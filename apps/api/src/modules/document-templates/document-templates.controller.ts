import {
  Controller,
  Get,
  Put,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { User, DocumentType } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF, ORG_ADMINS } from '@/common/auth/roles';
import { DocumentTemplatesService } from './document-templates.service';
import {
  UpdateDocumentTemplateDto,
  CreateDocumentSectionDto,
  UpdateDocumentSectionDto,
  ReorderSectionsDto,
} from './dto';

const READ_ROLES = ALL_STAFF;
const WRITE_ROLES = ORG_ADMINS;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const docxFileFilter = (
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const allowed = [DOCX_MIME, 'application/msword'];
  if (!allowed.includes(file.mimetype)) {
    cb(new BadRequestException('Alleen .docx of .doc bestanden zijn toegestaan'), false);
    return;
  }
  cb(null, true);
};

@ApiTags('document-templates')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller()
export class DocumentTemplatesController {
  constructor(private readonly service: DocumentTemplatesService) {}

  // =====================================================
  // PLAN / REPORT TEMPLATE (op inspection-templates)
  // =====================================================

  @Get('inspection-templates/:id/plan-template')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Plan-document-template ophalen (get-or-create)' })
  async getPlanTemplate(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return {
      success: true,
      data: await this.service.getDocumentTemplate(id, DocumentType.PLAN, user),
    };
  }

  @Put('inspection-templates/:id/plan-template')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Plan-document-template instellingen bijwerken' })
  async updatePlanTemplate(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentTemplateDto,
  ) {
    return {
      success: true,
      data: await this.service.updateDocumentTemplate(id, DocumentType.PLAN, user, dto),
    };
  }

  @Get('inspection-templates/:id/report-template')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Rapport-document-template ophalen (get-or-create)' })
  async getReportTemplate(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return {
      success: true,
      data: await this.service.getDocumentTemplate(id, DocumentType.REPORT, user),
    };
  }

  @Put('inspection-templates/:id/report-template')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Rapport-document-template instellingen bijwerken' })
  async updateReportTemplate(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentTemplateDto,
  ) {
    return {
      success: true,
      data: await this.service.updateDocumentTemplate(id, DocumentType.REPORT, user, dto),
    };
  }

  // =====================================================
  // PREVIEW (HTML)
  // =====================================================

  @Get('inspection-templates/:id/plan-template/preview')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'HTML-preview van het plan-template (voorbeelddata)' })
  async previewPlanTemplate(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const html = await this.service.renderPreview(id, DocumentType.PLAN, user);
    res.set({ 'Content-Type': 'text/html; charset=utf-8' }).send(html);
  }

  @Get('inspection-templates/:id/report-template/preview')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'HTML-preview van het rapport-template (voorbeelddata)' })
  async previewReportTemplate(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const html = await this.service.renderPreview(id, DocumentType.REPORT, user);
    res.set({ 'Content-Type': 'text/html; charset=utf-8' }).send(html);
  }

  // =====================================================
  // SECTIONS
  // =====================================================

  @Get('document-templates/:id/sections')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Secties van een document-template' })
  async getSections(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.getSections(id, user) };
  }

  @Post('document-templates/:id/sections')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Sectie toevoegen' })
  async createSection(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDocumentSectionDto,
  ) {
    return { success: true, data: await this.service.createSection(id, user, dto) };
  }

  // Specifieke route vóór de :sectionId param-route.
  @Post('document-templates/:id/sections/reorder')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Secties herordenen' })
  async reorderSections(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderSectionsDto,
  ) {
    return { success: true, data: await this.service.reorderSections(id, user, dto.sectionIds) };
  }

  @Patch('document-templates/:id/sections/:sectionId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Sectie bijwerken' })
  async updateSection(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: UpdateDocumentSectionDto,
  ) {
    return { success: true, data: await this.service.updateSection(id, sectionId, user, dto) };
  }

  @Delete('document-templates/:id/sections/:sectionId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Sectie verwijderen' })
  async deleteSection(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
  ) {
    return { success: true, data: await this.service.deleteSection(id, sectionId, user) };
  }

  // =====================================================
  // DOCX REVISIES
  // =====================================================

  @Post('document-templates/:id/docx')
  @Roles(...WRITE_ROLES)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'DOCX-revisie uploaden (max 50MB)' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: docxFileFilter,
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadDocx(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Geen bestand meegestuurd');
    }
    return { success: true, data: await this.service.uploadDocxRevision(id, user, file) };
  }

  @Get('document-templates/:id/docx/revisions')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'DOCX-revisies lijst' })
  async listDocxRevisions(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.listDocxRevisions(id, user) };
  }

  @Get('document-templates/:id/docx/revisions/:revisionId/download')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'DOCX-revisie downloaden (authenticated stream)' })
  async downloadDocxRevision(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.service.downloadDocxRevision(id, revisionId, user);
    res.set({
      'Content-Type': DOCX_MIME,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Content-Length': String(buffer.length),
    });
    res.send(buffer);
  }

  @Delete('document-templates/:id/docx/revisions/:revisionId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'DOCX-revisie verwijderen' })
  async deleteDocxRevision(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
  ) {
    return { success: true, data: await this.service.deleteDocxRevision(id, revisionId, user) };
  }

  // =====================================================
  // MIGRATIE
  // =====================================================

  @Post('document-templates/:id/migrate-to-blocks')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Secties migreren naar BLOCKS-modus' })
  async migrateToBlocks(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.migrateSectionsToBlocks(id, user) };
  }
}

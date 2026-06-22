import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  User,
  DocumentType,
  Prisma,
  SectionType,
  TemplateMode,
  TemplateStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound, assertSystemRowManageable } from '@/common';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '@/common/services/storage/storage.interface';
import { BlockHtmlRendererService } from '../document-generation/renderers/block-html-renderer.service';
import {
  DocumentRenderService,
  type RenderSection,
} from '../document-generation/document-render.service';
import { buildSampleContext } from '../document-generation/sample-context';
import {
  UpdateDocumentTemplateDto,
  CreateDocumentSectionDto,
  UpdateDocumentSectionDto,
} from './dto';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const SECTIONS_INCLUDE = {
  sections: {
    orderBy: { sortOrder: 'asc' as const },
    include: { childSections: { orderBy: { sortOrder: 'asc' as const } } },
  },
};

@Injectable()
export class DocumentTemplatesService {
  private readonly logger = new Logger(DocumentTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly blockRenderer: BlockHtmlRendererService,
    private readonly documentRender: DocumentRenderService,
  ) {}

  // =====================================================
  // DOCUMENT TEMPLATE (PLAN / REPORT)
  // =====================================================

  /**
   * Haal het document-template (PLAN of REPORT) van een inspectie-template op.
   * Bestaat het nog niet, dan wordt een default aangemaakt (alleen als de gebruiker
   * de parent mag beheren) — get-or-create.
   */
  async getDocumentTemplate(inspectionTemplateId: string, documentType: DocumentType, user: User) {
    const inspectionTemplate = await this.loadInspectionTemplateForRead(inspectionTemplateId, user);

    const existing = await this.findDocTemplate(inspectionTemplateId, documentType);
    if (existing) return existing;

    // Niet gevonden → alleen aanmaken als de gebruiker de parent-template mag beheren.
    this.assertManageable(inspectionTemplate, user);
    await this.createDefaultDocTemplate(inspectionTemplateId, documentType);
    return this.findDocTemplateOrThrow(inspectionTemplateId, documentType);
  }

  /** Werk de instellingen (en optioneel modus/blocks/docx-velden) van een document-template bij. */
  async updateDocumentTemplate(
    inspectionTemplateId: string,
    documentType: DocumentType,
    user: User,
    dto: UpdateDocumentTemplateDto,
  ) {
    const inspectionTemplate = await this.loadInspectionTemplateForRead(inspectionTemplateId, user);
    this.assertManageable(inspectionTemplate, user);
    this.assertConcept(inspectionTemplate.status);

    // Zorg dat de rij bestaat (manageable is hierboven al gecontroleerd).
    const existing = await this.findDocTemplate(inspectionTemplateId, documentType);
    const docTemplateId = existing
      ? existing.id
      : (await this.createDefaultDocTemplate(inspectionTemplateId, documentType)).id;

    return this.prisma.documentTemplate.update({
      where: { id: docTemplateId },
      data: {
        pageSize: dto.pageSize,
        orientation: dto.orientation,
        marginTop: dto.marginTop,
        marginBottom: dto.marginBottom,
        marginLeft: dto.marginLeft,
        marginRight: dto.marginRight,
        headerHtml: dto.headerHtml,
        footerHtml: dto.footerHtml,
        coverPageHtml: dto.coverPageHtml,
        ...(dto.templateMode !== undefined && { templateMode: dto.templateMode }),
        ...(dto.contentBlocks !== undefined && {
          contentBlocks: dto.contentBlocks as Prisma.InputJsonValue,
        }),
        ...(dto.docxStorageKey !== undefined && { docxStorageKey: dto.docxStorageKey }),
        ...(dto.docxFileName !== undefined && { docxFileName: dto.docxFileName }),
        ...(dto.docxFileSize !== undefined && { docxFileSize: dto.docxFileSize }),
      },
      include: SECTIONS_INCLUDE,
    });
  }

  // =====================================================
  // SECTIONS
  // =====================================================

  async getSections(documentTemplateId: string, user: User) {
    await this.loadDocTemplate(documentTemplateId, user, { write: false });
    return this.prisma.documentSection.findMany({
      where: { documentTemplateId },
      orderBy: { sortOrder: 'asc' },
      include: { childSections: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async createSection(documentTemplateId: string, user: User, dto: CreateDocumentSectionDto) {
    await this.loadDocTemplate(documentTemplateId, user, { write: true });

    const existing = await this.prisma.documentSection.findUnique({
      where: { documentTemplateId_code: { documentTemplateId, code: dto.code } },
    });
    if (existing) {
      throw new BadRequestException(`Sectie met code "${dto.code}" bestaat al in dit document-template`);
    }

    return this.prisma.documentSection.create({
      data: {
        documentTemplateId,
        code: dto.code,
        title: dto.title,
        sectionType: dto.sectionType,
        contentHtml: dto.contentHtml,
        repeatOn: dto.repeatOn,
        repeatItemTemplate: dto.repeatItemTemplate,
        condition: dto.condition,
        sortOrder: dto.sortOrder,
        includeInToc: dto.includeInToc ?? true,
        pageBreakBefore: dto.pageBreakBefore ?? false,
        pageBreakAfter: dto.pageBreakAfter ?? false,
        parentSectionId: dto.parentSectionId,
      },
    });
  }

  async updateSection(
    documentTemplateId: string,
    sectionId: string,
    user: User,
    dto: UpdateDocumentSectionDto,
  ) {
    await this.loadDocTemplate(documentTemplateId, user, { write: true });
    await this.assertSectionInTemplate(sectionId, documentTemplateId);

    return this.prisma.documentSection.update({
      where: { id: sectionId },
      data: {
        title: dto.title,
        sectionType: dto.sectionType,
        contentHtml: dto.contentHtml,
        repeatOn: dto.repeatOn,
        repeatItemTemplate: dto.repeatItemTemplate,
        condition: dto.condition,
        includeInToc: dto.includeInToc,
        pageBreakBefore: dto.pageBreakBefore,
        pageBreakAfter: dto.pageBreakAfter,
        parentSectionId: dto.parentSectionId,
      },
    });
  }

  async deleteSection(documentTemplateId: string, sectionId: string, user: User) {
    await this.loadDocTemplate(documentTemplateId, user, { write: true });
    await this.assertSectionInTemplate(sectionId, documentTemplateId);

    await this.prisma.documentSection.delete({ where: { id: sectionId } });
    return { deleted: true };
  }

  async reorderSections(documentTemplateId: string, user: User, sectionIds: string[]) {
    await this.loadDocTemplate(documentTemplateId, user, { write: true });

    // Alle opgegeven secties moeten bij dit template horen.
    const count = await this.prisma.documentSection.count({
      where: { id: { in: sectionIds }, documentTemplateId },
    });
    if (count !== sectionIds.length) {
      throw new BadRequestException('Een of meer secties horen niet bij dit document-template');
    }

    await this.prisma.$transaction(
      sectionIds.map((id, index) =>
        this.prisma.documentSection.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    return this.getSections(documentTemplateId, user);
  }

  // =====================================================
  // DOCX REVISIES
  // =====================================================

  /** Upload een nieuwe DOCX-revisie via de storage-provider en koppel die aan het template. */
  async uploadDocxRevision(documentTemplateId: string, user: User, file: Express.Multer.File) {
    const docTemplate = await this.loadDocTemplate(documentTemplateId, user, { write: true });

    const lastRevision = await this.prisma.documentTemplateDocxRevision.findFirst({
      where: { documentTemplateId },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (lastRevision?.version ?? 0) + 1;

    // Org-geprefixte key conform Beheer-conventie (${orgId}/...).
    const orgPrefix = docTemplate.inspectionTemplate.orgId ?? 'system';
    const storageKey = `${orgPrefix}/document-templates/${documentTemplateId}/docx/v${nextVersion}.docx`;
    await this.storage.upload(storageKey, file.buffer, DOCX_MIME);

    this.logger.log(`DOCX-revisie v${nextVersion} geüpload: ${storageKey}`);

    const revision = await this.prisma.documentTemplateDocxRevision.create({
      data: {
        documentTemplateId,
        storageKey,
        fileName: file.originalname,
        fileSize: file.size,
        uploadedById: user.id,
        version: nextVersion,
      },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    });

    await this.prisma.documentTemplate.update({
      where: { id: documentTemplateId },
      data: {
        templateMode: TemplateMode.DOCX,
        docxStorageKey: storageKey,
        docxFileName: file.originalname,
        docxFileSize: file.size,
      },
    });

    return revision;
  }

  async listDocxRevisions(documentTemplateId: string, user: User) {
    await this.loadDocTemplate(documentTemplateId, user, { write: false });
    return this.prisma.documentTemplateDocxRevision.findMany({
      where: { documentTemplateId },
      orderBy: { version: 'desc' },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  /**
   * Stream-download van een DOCX-revisie (de Beheer StorageProvider kent geen signed URLs).
   * Geeft de buffer + bestandsnaam terug; de controller zet de juiste headers.
   */
  async downloadDocxRevision(
    documentTemplateId: string,
    revisionId: string,
    user: User,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    await this.loadDocTemplate(documentTemplateId, user, { write: false });

    const revision = await this.prisma.documentTemplateDocxRevision.findUnique({
      where: { id: revisionId },
    });
    if (!revision || revision.documentTemplateId !== documentTemplateId) {
      throw new NotFoundException('DOCX-revisie niet gevonden');
    }

    const buffer = await this.storage.download(revision.storageKey);
    return { buffer, fileName: revision.fileName };
  }

  async deleteDocxRevision(documentTemplateId: string, revisionId: string, user: User) {
    const docTemplate = await this.loadDocTemplate(documentTemplateId, user, { write: true });

    const revision = await this.prisma.documentTemplateDocxRevision.findUnique({
      where: { id: revisionId },
    });
    if (!revision || revision.documentTemplateId !== documentTemplateId) {
      throw new NotFoundException('DOCX-revisie niet gevonden');
    }

    // Best-effort verwijderen uit storage.
    try {
      await this.storage.delete(revision.storageKey);
    } catch (e) {
      this.logger.warn(
        `Kon storage-bestand niet verwijderen: ${revision.storageKey}: ${(e as Error).message}`,
      );
    }

    await this.prisma.documentTemplateDocxRevision.delete({ where: { id: revisionId } });

    // Was dit de actieve revisie? Verwijs naar de vorige, of val terug op SECTIONS.
    if (docTemplate.docxStorageKey === revision.storageKey) {
      const previous = await this.prisma.documentTemplateDocxRevision.findFirst({
        where: { documentTemplateId },
        orderBy: { version: 'desc' },
      });
      await this.prisma.documentTemplate.update({
        where: { id: documentTemplateId },
        data: {
          docxStorageKey: previous?.storageKey ?? null,
          docxFileName: previous?.fileName ?? null,
          docxFileSize: previous?.fileSize ?? null,
          ...(previous === null && { templateMode: TemplateMode.SECTIONS }),
        },
      });
    }

    return { deleted: true };
  }

  // =====================================================
  // MIGRATIE (SECTIONS → BLOCKS)
  // =====================================================

  async migrateSectionsToBlocks(documentTemplateId: string, user: User) {
    const docTemplate = await this.loadDocTemplate(documentTemplateId, user, {
      write: true,
      withSections: true,
    });

    const sections = docTemplate.sections ?? [];
    const blocks = sections.map((section, index) => {
      const id = randomUUID();

      switch (section.sectionType) {
        case SectionType.TABLE_OF_CONTENTS:
          return {
            id,
            type: 'toc',
            width: 'full',
            order: index,
            content: { title: section.title || 'Inhoudsopgave', showPageNumbers: true },
          };

        case SectionType.SIGNATURE_BLOCK:
          return {
            id,
            type: 'signature_block',
            width: 'full',
            order: index,
            content: { signerRoles: ['inspector', 'reviewer'], showDate: true, showFunction: true },
          };

        default: {
          const rawHtml =
            section.contentHtml ||
            (section.repeatItemTemplate ? `<p>${section.repeatItemTemplate}</p>` : null) ||
            `<h2>${section.title}</h2>`;

          return {
            id,
            type: 'rich_text',
            width: 'full',
            order: index,
            content: {
              tiptapJson: null,
              rawHtml,
              ...(section.condition ? { condition: section.condition } : {}),
              ...(section.repeatOn ? { repeatOn: section.repeatOn } : {}),
            },
          };
        }
      }
    });

    return this.prisma.documentTemplate.update({
      where: { id: documentTemplateId },
      data: {
        templateMode: TemplateMode.BLOCKS,
        contentBlocks: blocks as Prisma.InputJsonValue,
      },
    });
  }

  // =====================================================
  // PREVIEW
  // =====================================================

  /**
   * Render een HTML-preview van het document-template met voorbeelddata.
   * SECTIONS → Handlebars-render; BLOCKS → block-renderer (previewMode);
   * DOCX → informatieve HTML (preview niet beschikbaar, geen fout).
   */
  async renderPreview(
    inspectionTemplateId: string,
    documentType: DocumentType,
    user: User,
  ): Promise<string> {
    const docTemplate = await this.getDocumentTemplate(inspectionTemplateId, documentType, user);
    const context = buildSampleContext(documentType);

    if (docTemplate.templateMode === TemplateMode.DOCX) {
      return this.docxPreviewHtml(docTemplate.docxFileName);
    }

    if (docTemplate.templateMode === TemplateMode.BLOCKS) {
      const blocks = Array.isArray(docTemplate.contentBlocks)
        ? (docTemplate.contentBlocks as unknown[])
        : [];
      return this.blockRenderer.renderFullDocument(
        blocks as Parameters<BlockHtmlRendererService['renderFullDocument']>[0],
        {
          pageSize: docTemplate.pageSize,
          orientation: docTemplate.orientation,
          marginTop: docTemplate.marginTop,
          marginBottom: docTemplate.marginBottom,
          marginLeft: docTemplate.marginLeft,
          marginRight: docTemplate.marginRight,
          headerHtml: docTemplate.headerHtml,
          footerHtml: docTemplate.footerHtml,
          coverPageHtml: docTemplate.coverPageHtml,
          previewMode: true,
        },
      );
    }

    // SECTIONS
    return this.documentRender.renderHtml(
      docTemplate,
      (docTemplate.sections ?? []) as unknown as RenderSection[],
      context,
    );
  }

  // =====================================================
  // HELPERS
  // =====================================================

  private findDocTemplate(inspectionTemplateId: string, documentType: DocumentType) {
    return this.prisma.documentTemplate.findUnique({
      where: { inspectionTemplateId_documentType: { inspectionTemplateId, documentType } },
      include: SECTIONS_INCLUDE,
    });
  }

  private async findDocTemplateOrThrow(inspectionTemplateId: string, documentType: DocumentType) {
    const dt = await this.findDocTemplate(inspectionTemplateId, documentType);
    return assertFound(dt, 'Document-template');
  }

  /** Maak een default document-template aan; tolereert een race (P2002). */
  private async createDefaultDocTemplate(inspectionTemplateId: string, documentType: DocumentType) {
    try {
      return await this.prisma.documentTemplate.create({
        data: { inspectionTemplateId, documentType },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Parallelle aanmaak — de rij bestaat nu.
        return this.findDocTemplateOrThrow(inspectionTemplateId, documentType);
      }
      throw e;
    }
  }

  private async loadInspectionTemplateForRead(inspectionTemplateId: string, user: User) {
    const t = await this.prisma.inspectionTemplate.findUnique({
      where: { id: inspectionTemplateId },
    });
    const template = assertFound(t, 'Inspectie-template');
    this.assertVisible(template, user);
    return template;
  }

  /**
   * Laad een document-template met zijn inspectie-template (+ optioneel secties),
   * controleer zichtbaarheid en — bij writes — beheerbaarheid en CONCEPT-status.
   */
  private async loadDocTemplate(
    documentTemplateId: string,
    user: User,
    opts: { write: boolean; withSections?: boolean },
  ) {
    const docTemplate = await this.prisma.documentTemplate.findUnique({
      where: { id: documentTemplateId },
      include: {
        inspectionTemplate: true,
        ...(opts.withSections
          ? { sections: { orderBy: { sortOrder: 'asc' as const } } }
          : {}),
      },
    });
    const dt = assertFound(docTemplate, 'Document-template');

    this.assertVisible(dt.inspectionTemplate, user);
    if (opts.write) {
      this.assertManageable(dt.inspectionTemplate, user);
      this.assertConcept(dt.inspectionTemplate.status);
    }
    return dt;
  }

  private async assertSectionInTemplate(sectionId: string, documentTemplateId: string) {
    const section = await this.prisma.documentSection.findUnique({ where: { id: sectionId } });
    if (!section || section.documentTemplateId !== documentTemplateId) {
      throw new NotFoundException('Sectie niet gevonden in dit document-template');
    }
    return section;
  }

  /** Zichtbaarheid: eigen-org-rij of systeemrij; superuser (orgId null) ziet alles. */
  private assertVisible(template: { orgId: string | null; isSystem: boolean }, user: User): void {
    if (user.orgId !== null) {
      const canAccess =
        template.orgId === user.orgId || (template.orgId === null && template.isSystem);
      if (!canAccess) throw new NotFoundException('Inspectie-template niet gevonden');
    }
  }

  /** Beheerbaarheid: systeemrijen alleen door superuser, org-rijen door de eigen org. */
  private assertManageable(template: { isSystem: boolean; orgId: string | null }, user: User): void {
    assertSystemRowManageable(template, user, {
      system: 'Systeem-templates zijn alleen-lezen. Fork eerst.',
      org: 'Deze template hoort niet bij uw organisatie',
    });
  }

  private assertConcept(status: TemplateStatus): void {
    if (status !== TemplateStatus.CONCEPT) {
      throw new BadRequestException(
        'Alleen mogelijk bij inspectie-templates met status CONCEPT',
      );
    }
  }

  private docxPreviewHtml(fileName: string | null): string {
    const safeName = fileName ? fileName.replace(/[<>&"]/g, '') : 'document.docx';
    return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><title>DOCX-modus</title></head>
<body style="font-family: Arial, sans-serif; padding: 32px; color: #374151;">
  <h2>DOCX-modus</h2>
  <p>Dit document-template gebruikt een geüploade DOCX-revisie (<strong>${safeName}</strong>).</p>
  <p>Er is geen HTML-preview beschikbaar — download de DOCX-revisie om de inhoud te bekijken.</p>
</body>
</html>`;
  }
}

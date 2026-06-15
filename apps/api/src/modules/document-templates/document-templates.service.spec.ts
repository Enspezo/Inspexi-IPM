import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DocumentType, SectionType, TemplateMode, TemplateStatus, User } from '@prisma/client';
import { DocumentTemplatesService } from './document-templates.service';

// ──────────────────────────── Mocks & fixtures ────────────────────────────

function createPrismaMock() {
  return {
    inspectionTemplate: { findUnique: jest.fn() },
    documentTemplate: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    documentSection: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    documentTemplateDocxRevision: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

const orgAdmin = { id: 'u1', orgId: 'orgA', roles: ['ORG_ADMIN'] } as unknown as User;
const superuser = { id: 'su', orgId: null, roles: ['SUPERUSER'] } as unknown as User;
const otherOrgUser = { id: 'u2', orgId: 'orgB', roles: ['ORG_ADMIN'] } as unknown as User;

const orgTemplate = { id: 'it1', orgId: 'orgA', isSystem: false, status: TemplateStatus.CONCEPT };
const orgTemplateActive = { id: 'it1', orgId: 'orgA', isSystem: false, status: TemplateStatus.ACTIEF };
const systemTemplate = { id: 'sys', orgId: null, isSystem: true, status: TemplateStatus.CONCEPT };

describe('DocumentTemplatesService', () => {
  let service: DocumentTemplatesService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let storage: { upload: jest.Mock; download: jest.Mock; delete: jest.Mock; exists: jest.Mock };
  let blockRenderer: { renderFullDocument: jest.Mock };
  let documentRender: { renderHtml: jest.Mock };

  beforeEach(() => {
    prisma = createPrismaMock();
    storage = { upload: jest.fn(), download: jest.fn(), delete: jest.fn(), exists: jest.fn() };
    blockRenderer = { renderFullDocument: jest.fn().mockReturnValue('<html>blocks</html>') };
    documentRender = { renderHtml: jest.fn().mockReturnValue('<html>sections</html>') };
    service = new DocumentTemplatesService(
      prisma as never,
      storage as never,
      blockRenderer as never,
      documentRender as never,
    );
  });

  // ──────────────────────────── getDocumentTemplate ────────────────────────────

  describe('getDocumentTemplate', () => {
    it('returns the existing template without creating', async () => {
      const existing = { id: 'dt1', templateMode: TemplateMode.SECTIONS, sections: [] };
      prisma.inspectionTemplate.findUnique.mockResolvedValue(orgTemplate);
      prisma.documentTemplate.findUnique.mockResolvedValue(existing);

      const result = await service.getDocumentTemplate('it1', DocumentType.PLAN, orgAdmin);

      expect(result).toBe(existing);
      expect(prisma.documentTemplate.create).not.toHaveBeenCalled();
    });

    it('creates a default when missing and the user can manage the parent', async () => {
      const created = { id: 'dt-new', templateMode: TemplateMode.SECTIONS, sections: [] };
      prisma.inspectionTemplate.findUnique.mockResolvedValue(orgTemplate);
      prisma.documentTemplate.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(created);
      prisma.documentTemplate.create.mockResolvedValue(created);

      const result = await service.getDocumentTemplate('it1', DocumentType.PLAN, orgAdmin);

      expect(prisma.documentTemplate.create).toHaveBeenCalledWith({
        data: { inspectionTemplateId: 'it1', documentType: DocumentType.PLAN },
      });
      expect(result).toBe(created);
    });

    it('forbids creating when the parent is a system template and the user is org-scoped', async () => {
      prisma.inspectionTemplate.findUnique.mockResolvedValue(systemTemplate);
      prisma.documentTemplate.findUnique.mockResolvedValue(null);

      await expect(service.getDocumentTemplate('sys', DocumentType.PLAN, orgAdmin)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.documentTemplate.create).not.toHaveBeenCalled();
    });

    it('hides cross-org inspection templates (404)', async () => {
      prisma.inspectionTemplate.findUnique.mockResolvedValue(orgTemplate); // orgA
      await expect(
        service.getDocumentTemplate('it1', DocumentType.PLAN, otherOrgUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows a superuser to create on a system template', async () => {
      const created = { id: 'dt-sys', templateMode: TemplateMode.SECTIONS, sections: [] };
      prisma.inspectionTemplate.findUnique.mockResolvedValue(systemTemplate);
      prisma.documentTemplate.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(created);
      prisma.documentTemplate.create.mockResolvedValue(created);

      await expect(service.getDocumentTemplate('sys', DocumentType.REPORT, superuser)).resolves.toBe(
        created,
      );
    });
  });

  // ──────────────────────────── updateDocumentTemplate ────────────────────────────

  describe('updateDocumentTemplate', () => {
    it('rejects updates when the parent template is not CONCEPT', async () => {
      prisma.inspectionTemplate.findUnique.mockResolvedValue(orgTemplateActive);
      await expect(
        service.updateDocumentTemplate('it1', DocumentType.PLAN, orgAdmin, { pageSize: 'A4' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates an existing template row', async () => {
      prisma.inspectionTemplate.findUnique.mockResolvedValue(orgTemplate);
      prisma.documentTemplate.findUnique.mockResolvedValue({ id: 'dt1' });
      prisma.documentTemplate.update.mockResolvedValue({ id: 'dt1', pageSize: 'A3' });

      const result = await service.updateDocumentTemplate('it1', DocumentType.PLAN, orgAdmin, {
        pageSize: 'A3',
        templateMode: TemplateMode.BLOCKS,
        contentBlocks: [{ id: 'b', type: 'rich_text', width: 'full', order: 0, content: {} }],
      });

      expect(prisma.documentTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dt1' },
          data: expect.objectContaining({ pageSize: 'A3', templateMode: TemplateMode.BLOCKS }),
        }),
      );
      expect(result).toEqual({ id: 'dt1', pageSize: 'A3' });
    });
  });

  // ──────────────────────────── sections ────────────────────────────

  describe('sections', () => {
    it('rejects duplicate section codes', async () => {
      prisma.documentTemplate.findUnique.mockResolvedValue({ id: 'dt1', inspectionTemplate: orgTemplate });
      prisma.documentSection.findUnique.mockResolvedValue({ id: 'exists' });

      await expect(
        service.createSection('dt1', orgAdmin, {
          code: 'intro',
          title: 'Inleiding',
          sectionType: SectionType.STATIC,
          sortOrder: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a section on a manageable CONCEPT template', async () => {
      prisma.documentTemplate.findUnique.mockResolvedValue({ id: 'dt1', inspectionTemplate: orgTemplate });
      prisma.documentSection.findUnique.mockResolvedValue(null);
      prisma.documentSection.create.mockResolvedValue({ id: 'sec1' });

      const result = await service.createSection('dt1', orgAdmin, {
        code: 'intro',
        title: 'Inleiding',
        sectionType: SectionType.STATIC,
        sortOrder: 0,
      });

      expect(prisma.documentSection.create).toHaveBeenCalled();
      expect(result).toEqual({ id: 'sec1' });
    });

    it('forbids writes on a system template by an org user (403)', async () => {
      prisma.documentTemplate.findUnique.mockResolvedValue({ id: 'dt1', inspectionTemplate: systemTemplate });
      await expect(
        service.createSection('dt1', orgAdmin, {
          code: 'x',
          title: 'X',
          sectionType: SectionType.STATIC,
          sortOrder: 0,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects reorder when section ids do not all belong to the template', async () => {
      prisma.documentTemplate.findUnique.mockResolvedValue({ id: 'dt1', inspectionTemplate: orgTemplate });
      prisma.documentSection.count.mockResolvedValue(1);

      await expect(service.reorderSections('dt1', orgAdmin, ['s1', 's2'])).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ──────────────────────────── DOCX revisions ────────────────────────────

  describe('docx revisions', () => {
    const file = {
      buffer: Buffer.from('docx'),
      originalname: 'rapport.docx',
      size: 4,
    } as Express.Multer.File;

    it('uploads with the next version number and flips mode to DOCX', async () => {
      prisma.documentTemplate.findUnique.mockResolvedValue({
        id: 'dt1',
        docxStorageKey: null,
        inspectionTemplate: orgTemplate,
      });
      prisma.documentTemplateDocxRevision.findFirst.mockResolvedValue({ version: 2 });
      prisma.documentTemplateDocxRevision.create.mockResolvedValue({ id: 'rev3', version: 3 });
      prisma.documentTemplate.update.mockResolvedValue({});

      const result = await service.uploadDocxRevision('dt1', orgAdmin, file);

      expect(storage.upload).toHaveBeenCalledWith(
        expect.stringContaining('orgA/document-templates/dt1/docx/v3.docx'),
        file.buffer,
        expect.stringContaining('wordprocessingml'),
      );
      expect(prisma.documentTemplateDocxRevision.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 3 }) }),
      );
      expect(prisma.documentTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ templateMode: TemplateMode.DOCX }) }),
      );
      expect(result).toEqual({ id: 'rev3', version: 3 });
    });

    it('streams a download buffer + filename', async () => {
      prisma.documentTemplate.findUnique.mockResolvedValue({ id: 'dt1', inspectionTemplate: orgTemplate });
      prisma.documentTemplateDocxRevision.findUnique.mockResolvedValue({
        id: 'rev1',
        documentTemplateId: 'dt1',
        storageKey: 'orgA/.../v1.docx',
        fileName: 'v1.docx',
      });
      storage.download.mockResolvedValue(Buffer.from('file-bytes'));

      const result = await service.downloadDocxRevision('dt1', 'rev1', orgAdmin);

      expect(storage.download).toHaveBeenCalledWith('orgA/.../v1.docx');
      expect(result.fileName).toBe('v1.docx');
      expect(result.buffer.toString()).toBe('file-bytes');
    });

    it('404s when the revision does not belong to the template', async () => {
      prisma.documentTemplate.findUnique.mockResolvedValue({ id: 'dt1', inspectionTemplate: orgTemplate });
      prisma.documentTemplateDocxRevision.findUnique.mockResolvedValue({
        id: 'rev1',
        documentTemplateId: 'OTHER',
        storageKey: 'k',
        fileName: 'f',
      });

      await expect(service.downloadDocxRevision('dt1', 'rev1', orgAdmin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('reverts the template to SECTIONS when the last revision is deleted', async () => {
      prisma.documentTemplate.findUnique.mockResolvedValue({
        id: 'dt1',
        docxStorageKey: 'orgA/.../v1.docx',
        inspectionTemplate: orgTemplate,
      });
      prisma.documentTemplateDocxRevision.findUnique.mockResolvedValue({
        id: 'rev1',
        documentTemplateId: 'dt1',
        storageKey: 'orgA/.../v1.docx',
        version: 1,
      });
      prisma.documentTemplateDocxRevision.findFirst.mockResolvedValue(null); // no previous
      prisma.documentTemplateDocxRevision.delete.mockResolvedValue({});
      prisma.documentTemplate.update.mockResolvedValue({});

      await service.deleteDocxRevision('dt1', 'rev1', orgAdmin);

      expect(storage.delete).toHaveBeenCalledWith('orgA/.../v1.docx');
      expect(prisma.documentTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            templateMode: TemplateMode.SECTIONS,
            docxStorageKey: null,
          }),
        }),
      );
    });
  });

  // ──────────────────────────── migrate ────────────────────────────

  describe('migrateSectionsToBlocks', () => {
    it('maps section types to the correct block types', async () => {
      prisma.documentTemplate.findUnique.mockResolvedValue({
        id: 'dt1',
        inspectionTemplate: orgTemplate,
        sections: [
          { sectionType: SectionType.TABLE_OF_CONTENTS, title: 'TOC' },
          { sectionType: SectionType.SIGNATURE_BLOCK, title: 'Handtekeningen' },
          { sectionType: SectionType.STATIC, title: 'Inleiding', contentHtml: '<p>Hi</p>' },
        ],
      });
      prisma.documentTemplate.update.mockImplementation(({ data }: { data: { contentBlocks: unknown } }) =>
        Promise.resolve(data),
      );

      const result = await service.migrateSectionsToBlocks('dt1', orgAdmin);

      const blocks = (result as unknown as { contentBlocks: Array<{ type: string }> }).contentBlocks;
      expect(blocks.map((b) => b.type)).toEqual(['toc', 'signature_block', 'rich_text']);
      expect(prisma.documentTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ templateMode: TemplateMode.BLOCKS }) }),
      );
    });
  });

  // ──────────────────────────── preview ────────────────────────────

  describe('renderPreview', () => {
    it('returns informational HTML for DOCX mode (no throw)', async () => {
      prisma.inspectionTemplate.findUnique.mockResolvedValue(orgTemplate);
      prisma.documentTemplate.findUnique.mockResolvedValue({
        id: 'dt1',
        templateMode: TemplateMode.DOCX,
        docxFileName: 'rapport.docx',
      });

      const html = await service.renderPreview('it1', DocumentType.REPORT, orgAdmin);

      expect(html).toContain('DOCX-modus');
      expect(html).toContain('rapport.docx');
      expect(blockRenderer.renderFullDocument).not.toHaveBeenCalled();
      expect(documentRender.renderHtml).not.toHaveBeenCalled();
    });

    it('delegates BLOCKS preview to the block renderer with previewMode', async () => {
      prisma.inspectionTemplate.findUnique.mockResolvedValue(orgTemplate);
      prisma.documentTemplate.findUnique.mockResolvedValue({
        id: 'dt1',
        templateMode: TemplateMode.BLOCKS,
        contentBlocks: [{ id: 'b', type: 'rich_text', width: 'full', order: 0, content: {} }],
        pageSize: 'A4',
        orientation: 'portrait',
        marginTop: 20,
        marginBottom: 20,
        marginLeft: 20,
        marginRight: 20,
        headerHtml: null,
        footerHtml: null,
        coverPageHtml: null,
      });

      const html = await service.renderPreview('it1', DocumentType.PLAN, orgAdmin);

      expect(html).toBe('<html>blocks</html>');
      expect(blockRenderer.renderFullDocument).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ previewMode: true }),
      );
    });

    it('delegates SECTIONS preview to the document renderer', async () => {
      prisma.inspectionTemplate.findUnique.mockResolvedValue(orgTemplate);
      prisma.documentTemplate.findUnique.mockResolvedValue({
        id: 'dt1',
        templateMode: TemplateMode.SECTIONS,
        sections: [],
      });

      const html = await service.renderPreview('it1', DocumentType.REPORT, orgAdmin);

      expect(html).toBe('<html>sections</html>');
      expect(documentRender.renderHtml).toHaveBeenCalled();
    });
  });
});

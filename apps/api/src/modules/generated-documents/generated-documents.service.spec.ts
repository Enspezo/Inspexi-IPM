import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DocumentType, GeneratedDocumentStatus, SignatureStatus, Role } from '@prisma/client';
import { GeneratedDocumentsService } from './generated-documents.service';
import { GenerationContextService } from './generation-context.service';
import { PrismaService } from '@/prisma';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import { DocumentRenderService } from '../document-generation/document-render.service';
import { PdfGenerationService } from '../document-generation/pdf-generation.service';
import { WordExportService } from '../document-generation/word-export.service';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';

describe('GeneratedDocumentsService', () => {
  let service: GeneratedDocumentsService;

  const mockPrisma = {
    inspectionPlan: { findUnique: jest.fn(), findFirst: jest.fn() },
    documentTemplate: { findFirst: jest.fn(), findUnique: jest.fn() },
    generatedDocument: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    documentSignature: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    photo: { findMany: jest.fn() },
    normTypeDefinition: { findFirst: jest.fn() },
    finding: { findMany: jest.fn() },
    measurementSheetRecord: { findMany: jest.fn() },
    measurementInstrument: { findMany: jest.fn() },
  };

  const mockRender = { renderHtml: jest.fn() };
  const mockPdf = { renderPdf: jest.fn() };
  const mockWord = { htmlToDocx: jest.fn() };
  const mockStorage = { upload: jest.fn(), download: jest.fn(), delete: jest.fn(), exists: jest.fn() };
  // Asset nodes are assembled from the AssetNode tree (Fase 2b) instead of plan.assets.
  const mockAssetNodes = { listLocationNodesByOrg: jest.fn().mockResolvedValue([]) };

  const user = {
    id: 'user-1',
    orgId: 'org-1',
    firstName: 'Inge',
    lastName: 'Specteur',
    email: 'inge@org1.nl',
    roles: [Role.MANAGER],
  } as any;

  const fullPlan = () => ({
    id: 'plan-1',
    orgId: 'org-1',
    inspectionTemplateId: 'it-1',
    normTypeCode: 'NEN1010',
    statusCode: 'draft',
    projectName: 'Demo project',
    referenceNumber: 'INSP-2026-0001',
    description: 'Beschrijving',
    startedAt: null,
    plannedDate: new Date('2026-07-01'),
    createdAt: new Date('2026-06-01'),
    addressStreet: 'Industrieweg',
    addressHouseNumber: '12',
    addressPostalCode: '1234 AB',
    addressCity: 'Amsterdam',
    organization: { name: 'Org 1', logoUrl: null, senderEmail: 'org1@inspexi.nl' },
    contact: {
      companyName: 'Klant BV',
      firstName: null,
      lastName: null,
      email: 'klant@bv.nl',
      phone: '0612345678',
      addresses: [],
      contactPersons: [],
    },
    assignedUser: { firstName: 'Inge', lastName: 'Specteur', email: 'inge@org1.nl' },
    reviewer: null,
    inspectionTemplate: { classificationModel: { characteristics: [] } },
    measurementSheetRecords: [],
  });

  const renderTemplate = {
    id: 'tpl-1',
    templateMode: 'SECTIONS',
    pageSize: 'A4',
    orientation: 'portrait',
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 25,
    marginRight: 20,
    headerHtml: null,
    footerHtml: null,
    coverPageHtml: null,
    contentBlocks: null,
    sections: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAssetNodes.listLocationNodesByOrg.mockResolvedValue([]);
    mockPrisma.finding.findMany.mockResolvedValue([]);
    mockPrisma.measurementSheetRecord.findMany.mockResolvedValue([]);
    mockPrisma.measurementInstrument.findMany.mockResolvedValue([]);
    // WP-A3: default géén SIGNED-handtekeningen (hasSignedSignature → false).
    mockPrisma.documentSignature.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeneratedDocumentsService,
        GenerationContextService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DocumentRenderService, useValue: mockRender },
        { provide: PdfGenerationService, useValue: mockPdf },
        { provide: WordExportService, useValue: mockWord },
        { provide: STORAGE_PROVIDER, useValue: mockStorage },
        { provide: AssetNodesService, useValue: mockAssetNodes },
      ],
    }).compile();

    service = module.get<GeneratedDocumentsService>(GeneratedDocumentsService);
  });

  describe('generateDocument', () => {
    it('builds context, renders and creates a DRAFT document', async () => {
      mockPrisma.inspectionPlan.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(fullPlan());
      mockPrisma.documentTemplate.findFirst.mockResolvedValue(renderTemplate);
      mockPrisma.photo.findMany.mockResolvedValue([]);
      mockPrisma.normTypeDefinition.findFirst.mockResolvedValue({ label: 'NEN 1010' });
      mockRender.renderHtml.mockReturnValue('<html>doc</html>');
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: 'gd-1', status: 'DRAFT' });

      const result = await service.generateDocument('plan-1', DocumentType.PLAN, user);

      expect(mockRender.renderHtml).toHaveBeenCalledTimes(1);
      expect(mockPrisma.generatedDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            documentTemplateId: 'tpl-1',
            inspectionPlanId: 'plan-1',
            documentType: DocumentType.PLAN,
            htmlContent: '<html>doc</html>',
            status: GeneratedDocumentStatus.DRAFT,
            generatedBy: 'user-1',
          }),
        }),
      );
      expect(result).toEqual({ id: 'gd-1', status: 'DRAFT' });
    });

    it('rejects (403) generating a document for a foreign-org plan', async () => {
      mockPrisma.inspectionPlan.findUnique.mockResolvedValue({ orgId: 'org-2' });
      await expect(service.generateDocument('plan-1', DocumentType.PLAN, user)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.inspectionPlan.findFirst).not.toHaveBeenCalled();
    });

    it('rejects when the plan has no inspection template', async () => {
      mockPrisma.inspectionPlan.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({ ...fullPlan(), inspectionTemplateId: null });
      await expect(service.generateDocument('plan-1', DocumentType.PLAN, user)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateEditedContent', () => {
    it('blocks editing a finalized document', async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue({
        id: 'gd-1',
        status: GeneratedDocumentStatus.FINALIZED,
      });
      await expect(service.updateEditedContent('gd-1', user, '<p>x</p>')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks editing a signed document (SYNC-5)', async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue({
        id: 'gd-1',
        status: GeneratedDocumentStatus.SIGNED,
      });
      await expect(service.updateEditedContent('gd-1', user, '<p>x</p>')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.generatedDocument.update).not.toHaveBeenCalled();
    });

    // WP-A3 (B-104): de poort is het bestaan van een SIGNED-handtekeningrij,
    // niet alleen de documentstatus — PENDING_SIGNATURES met een eerste
    // handtekening is óók bevroren.
    it('blocks editing at PENDING_SIGNATURES once a SIGNED signature row exists (B-104)', async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue({
        id: 'gd-1',
        status: GeneratedDocumentStatus.PENDING_SIGNATURES,
      });
      mockPrisma.documentSignature.count.mockResolvedValue(1);

      await expect(service.updateEditedContent('gd-1', user, '<p>x</p>')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.documentSignature.count).toHaveBeenCalledWith({
        where: { generatedDocumentId: 'gd-1', status: SignatureStatus.SIGNED },
      });
      expect(mockPrisma.generatedDocument.update).not.toHaveBeenCalled();
    });

    it('allows editing at PENDING_SIGNATURES while no signature is SIGNED yet', async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue({
        id: 'gd-1',
        status: GeneratedDocumentStatus.PENDING_SIGNATURES,
      });
      mockPrisma.generatedDocument.update.mockResolvedValue({ id: 'gd-1', isEdited: true });

      await service.updateEditedContent('gd-1', user, '<p>x</p>');

      expect(mockPrisma.generatedDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'gd-1' },
          data: expect.objectContaining({ isEdited: true, editedBy: 'user-1' }),
        }),
      );
    });
  });

  // WP-A3 (B-102): verwijderen — FINALIZED → 403; ≥1 SIGNED-handtekening → 400.
  describe('delete', () => {
    it('blocks deleting a finalized document (403)', async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue({
        id: 'gd-1',
        status: GeneratedDocumentStatus.FINALIZED,
      });
      await expect(service.delete('gd-1', user)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.generatedDocument.delete).not.toHaveBeenCalled();
    });

    it('blocks deleting a document with a SIGNED signature (400, B-102)', async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue({
        id: 'gd-1',
        status: GeneratedDocumentStatus.PENDING_SIGNATURES,
        pdfUrl: null,
        wordUrl: null,
      });
      mockPrisma.documentSignature.count.mockResolvedValue(1);

      await expect(service.delete('gd-1', user)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.generatedDocument.delete).not.toHaveBeenCalled();
    });

    it('deletes an unsigned document', async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue({
        id: 'gd-1',
        status: GeneratedDocumentStatus.DRAFT,
        pdfUrl: null,
        wordUrl: null,
      });
      mockPrisma.generatedDocument.delete.mockResolvedValue({ id: 'gd-1' });

      await service.delete('gd-1', user);

      expect(mockPrisma.generatedDocument.delete).toHaveBeenCalledWith({ where: { id: 'gd-1' } });
    });
  });

  describe('finalizeDocument', () => {
    it('sets FINALIZED + finalizedAt', async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue({ id: 'gd-1', status: 'DRAFT' });
      mockPrisma.generatedDocument.update.mockResolvedValue({ id: 'gd-1', status: 'FINALIZED' });

      await service.finalizeDocument('gd-1', user);

      expect(mockPrisma.generatedDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'gd-1' },
          data: expect.objectContaining({ status: GeneratedDocumentStatus.FINALIZED }),
        }),
      );
    });
  });

  describe('export', () => {
    const doc = {
      id: 'gd-1',
      orgId: 'org-1',
      documentTemplateId: 'tpl-1',
      inspectionPlanId: 'plan-1',
      isEdited: false,
      editedContent: null,
      htmlContent: '<html>body</html>',
    };

    it('exports to PDF, stores it and returns the download route', async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(doc);
      mockPrisma.documentSignature.findMany.mockResolvedValue([]);
      mockPrisma.documentTemplate.findUnique.mockResolvedValue(renderTemplate);
      mockPdf.renderPdf.mockResolvedValue(Buffer.from('%PDF'));
      mockPrisma.generatedDocument.update.mockResolvedValue(doc);

      const url = await service.exportToPdf('gd-1', user);

      expect(mockPdf.renderPdf).toHaveBeenCalledTimes(1);
      expect(mockStorage.upload).toHaveBeenCalledWith(
        'org-1/documents/gd-1.pdf',
        expect.any(Buffer),
        'application/pdf',
      );
      expect(mockPrisma.generatedDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { pdfUrl: 'org-1/documents/gd-1.pdf' } }),
      );
      expect(url).toBe('/api/v1/generated-documents/gd-1/download?format=pdf');
    });

    it('exports to Word, stores it and returns the download route', async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(doc);
      mockWord.htmlToDocx.mockResolvedValue(Buffer.from('PK'));
      mockPrisma.generatedDocument.update.mockResolvedValue(doc);

      const url = await service.exportToWord('gd-1', user);

      expect(mockWord.htmlToDocx).toHaveBeenCalledTimes(1);
      expect(mockStorage.upload).toHaveBeenCalledWith(
        'org-1/documents/gd-1.docx',
        expect.any(Buffer),
        expect.stringContaining('wordprocessingml'),
      );
      expect(url).toBe('/api/v1/generated-documents/gd-1/download?format=word');
    });

    // B-311: header/footer met datalaag-placeholders krijgen bij preview/export
    // de (lichte) header-context + template-id mee naar de PDF-laag.
    it('geeft headerFooterContext + templateId mee wanneer header/footer data-placeholders bevatten', async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(doc);
      mockPrisma.documentSignature.findMany.mockResolvedValue([]);
      mockPrisma.documentTemplate.findUnique.mockResolvedValue({
        ...renderTemplate,
        headerHtml: '<div>{{organization.name}} — Inspectieplan</div>',
        footerHtml: '<div>Pagina {{pageNumber}} van {{totalPages}}</div>',
      });
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(fullPlan());
      mockPrisma.normTypeDefinition.findFirst.mockResolvedValue({ label: 'NEN 1010' });
      mockPdf.renderPdf.mockResolvedValue(Buffer.from('%PDF'));

      await service.generatePreview('gd-1', user);

      expect(mockPdf.renderPdf).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headerHtml: '<div>{{organization.name}} — Inspectieplan</div>',
          templateId: 'tpl-1',
          headerFooterContext: expect.objectContaining({
            organization: expect.objectContaining({ name: 'Org 1' }),
            client: expect.objectContaining({ name: 'Klant BV' }),
          }),
        }),
      );
      // De header-context is de lichte variant (header-only query).
      expect(mockPrisma.inspectionPlan.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'plan-1', orgId: 'org-1' }) }),
      );
    });

    it('slaat de context-query over wanneer header/footer alleen Puppeteer-tokens bevatten', async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(doc);
      mockPrisma.documentSignature.findMany.mockResolvedValue([]);
      mockPrisma.documentTemplate.findUnique.mockResolvedValue({
        ...renderTemplate,
        footerHtml: '<div>Pagina {{pageNumber}} van {{totalPages}}</div>',
      });
      mockPdf.renderPdf.mockResolvedValue(Buffer.from('%PDF'));

      await service.generatePreview('gd-1', user);

      expect(mockPrisma.inspectionPlan.findFirst).not.toHaveBeenCalled();
      expect(mockPdf.renderPdf).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headerFooterContext: undefined, templateId: 'tpl-1' }),
      );
    });

    it('levert bruikbare PdfOptions zonder context wanneer het plan verdwenen is (vangnet strips)', async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(doc);
      mockPrisma.documentSignature.findMany.mockResolvedValue([]);
      mockPrisma.documentTemplate.findUnique.mockResolvedValue({
        ...renderTemplate,
        headerHtml: '<div>{{organization.name}}</div>',
      });
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(null);
      mockPdf.renderPdf.mockResolvedValue(Buffer.from('%PDF'));

      await service.generatePreview('gd-1', user);

      expect(mockPdf.renderPdf).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headerFooterContext: undefined }),
      );
    });
  });

  // Defensieve laag vlak vóór interpolatie in de render-HTML (naast DTO-validatie).
  describe('injectSignaturesIntoHtml — injection hardening', () => {
    const inject = (html: string) =>
      (service as any).injectSignaturesIntoHtml('gd-1', html) as Promise<string>;

    it('HTML-escapes signerName and signerFunction', async () => {
      mockPrisma.documentSignature.findMany.mockResolvedValue([
        {
          signerName: '<img src=x onerror="alert(1)">',
          signerFunction: 'Chef "Inspectie"',
          signerRoleCode: 'INSPECTOR',
          signatureImage: null,
          signedAt: new Date('2026-07-01'),
          status: SignatureStatus.SIGNED,
        },
      ]);

      const out = await inject('<html><body>doc</body></html>');

      expect(out).not.toContain('<img src=x onerror=');
      expect(out).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
      expect(out).toContain('Chef &quot;Inspectie&quot;');
    });

    it('drops a signatureImage that is not a safe data: URL (SSRF)', async () => {
      mockPrisma.documentSignature.findMany.mockResolvedValue([
        {
          signerName: 'Jan',
          signerRoleCode: 'INSPECTOR',
          signatureImage: 'file:///etc/passwd',
          signedAt: new Date('2026-07-01'),
          status: SignatureStatus.SIGNED,
        },
      ]);

      const out = await inject('<html><body>doc</body></html>');

      expect(out).not.toContain('file:///etc/passwd');
      expect(out).not.toContain('<img');
    });

    it('keeps a valid base64 data: image', async () => {
      const png =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      mockPrisma.documentSignature.findMany.mockResolvedValue([
        {
          signerName: 'Jan',
          signerRoleCode: 'INSPECTOR',
          signatureImage: png,
          signedAt: new Date('2026-07-01'),
          status: SignatureStatus.SIGNED,
        },
      ]);

      const out = await inject('<html><body>doc</body></html>');

      expect(out).toContain(`<img src="${png}"`);
    });
  });
});

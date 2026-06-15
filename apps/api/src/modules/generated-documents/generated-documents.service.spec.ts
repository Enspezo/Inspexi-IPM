import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentType, GeneratedDocumentStatus, SignatureStatus, Role } from '@prisma/client';
import { GeneratedDocumentsService } from './generated-documents.service';
import { PrismaService } from '@/prisma';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import { EmailService } from '@/common/services/email.service';
import { LookupService } from '../lookups/lookup.service';
import { DocumentRenderService } from '../document-generation/document-render.service';
import { PdfGenerationService } from '../document-generation/pdf-generation.service';
import { WordExportService } from '../document-generation/word-export.service';

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
    },
    photo: { findMany: jest.fn() },
    normTypeDefinition: { findFirst: jest.fn() },
  };

  const mockRender = { renderHtml: jest.fn() };
  const mockPdf = { renderPdf: jest.fn() };
  const mockWord = { htmlToDocx: jest.fn() };
  const mockStorage = { upload: jest.fn(), download: jest.fn(), delete: jest.fn(), exists: jest.fn() };
  const mockEmail = { sendNotificationEmail: jest.fn() };
  const mockLookups = { resolveLookup: jest.fn() };
  const mockConfig = { get: jest.fn((_k: string, def?: string) => def) };

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
    assets: [],
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
    mockEmail.sendNotificationEmail.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeneratedDocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DocumentRenderService, useValue: mockRender },
        { provide: PdfGenerationService, useValue: mockPdf },
        { provide: WordExportService, useValue: mockWord },
        { provide: STORAGE_PROVIDER, useValue: mockStorage },
        { provide: EmailService, useValue: mockEmail },
        { provide: ConfigService, useValue: mockConfig },
        { provide: LookupService, useValue: mockLookups },
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
  });

  describe('requestSignature', () => {
    const doc = { id: 'gd-1', orgId: 'org-1', status: GeneratedDocumentStatus.DRAFT };

    it('validates the role, creates a REQUESTED signature, mails the link and flips status', async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(doc);
      mockLookups.resolveLookup.mockResolvedValue({ code: 'INSPECTOR', label: 'Inspecteur' });
      mockPrisma.documentSignature.create.mockImplementation(({ data }: any) => ({ id: 'sig-1', ...data }));
      mockPrisma.generatedDocument.update.mockResolvedValue(doc);

      const sig = await service.requestSignature('gd-1', user, {
        signerRoleCode: 'INSPECTOR',
        signerName: 'Jan Klant',
        signerEmail: 'jan@klant.nl',
      } as any);

      expect(mockLookups.resolveLookup).toHaveBeenCalledWith('signer-roles', 'INSPECTOR', 'org-1');
      expect(mockPrisma.documentSignature.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            generatedDocumentId: 'gd-1',
            signerRoleCode: 'INSPECTOR',
            status: SignatureStatus.REQUESTED,
            signatureRequestUrl: expect.stringContaining('/sign/'),
          }),
        }),
      );
      expect(mockPrisma.generatedDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: GeneratedDocumentStatus.PENDING_SIGNATURES } }),
      );
      expect(mockEmail.sendNotificationEmail).toHaveBeenCalledWith(
        'jan@klant.nl',
        'Ondertekenverzoek',
        expect.stringContaining('/sign/'),
        expect.objectContaining({ orgId: 'org-1' }),
      );
      expect(sig.signatureRequestId).toBeDefined();
    });

    it('rejects an unknown signer role', async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(doc);
      mockLookups.resolveLookup.mockResolvedValue(null);

      await expect(
        service.requestSignature('gd-1', user, {
          signerRoleCode: 'NOPE',
          signerName: 'X',
          signerEmail: 'x@y.nl',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.documentSignature.create).not.toHaveBeenCalled();
    });
  });

  describe('public signing', () => {
    it('getSignatureRequest returns only the document HTML + sign fields', async () => {
      mockPrisma.documentSignature.findFirst.mockResolvedValue({
        id: 'sig-1',
        status: SignatureStatus.REQUESTED,
        signatureRequestSentAt: new Date(),
        signerRoleCode: 'INSPECTOR',
        signerName: 'Jan Klant',
        generatedDocumentId: 'gd-1',
        generatedDocument: {
          id: 'gd-1',
          documentType: DocumentType.PLAN,
          htmlContent: '<html>te tekenen</html>',
          editedContent: null,
          isEdited: false,
          inspectionPlan: { projectName: 'Demo', referenceNumber: 'INSP-1' },
        },
      });

      const result = await service.getSignatureRequest('req-1');

      expect(result.html).toBe('<html>te tekenen</html>');
      expect(result.signerRoleCode).toBe('INSPECTOR');
      expect(result.status).toBe(SignatureStatus.REQUESTED);
      // Geen overige org-data gelekt.
      expect(result).not.toHaveProperty('signerEmail');
      expect(JSON.stringify(result)).not.toContain('internalNotes');
    });

    it('getSignatureRequest rejects an already-signed request', async () => {
      mockPrisma.documentSignature.findFirst.mockResolvedValue({
        id: 'sig-1',
        status: SignatureStatus.SIGNED,
        signatureRequestSentAt: new Date(),
        generatedDocument: { id: 'gd-1', documentType: 'PLAN', htmlContent: '', editedContent: null, isEdited: false, inspectionPlan: { projectName: 'x', referenceNumber: 'y' } },
      });
      await expect(service.getSignatureRequest('req-1')).rejects.toThrow(BadRequestException);
    });

    it('signViaRequest marks the signature SIGNED and recomputes the document status', async () => {
      mockPrisma.documentSignature.findFirst.mockResolvedValue({
        id: 'sig-1',
        status: SignatureStatus.REQUESTED,
        signatureRequestSentAt: new Date(),
        generatedDocumentId: 'gd-1',
        signerName: 'Jan Klant',
      });
      mockPrisma.documentSignature.update.mockResolvedValue({ id: 'sig-1', status: 'SIGNED' });
      mockPrisma.documentSignature.findMany.mockResolvedValue([{ status: SignatureStatus.SIGNED }]);
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({
        id: 'gd-1',
        status: GeneratedDocumentStatus.PENDING_SIGNATURES,
      });
      mockPrisma.generatedDocument.update.mockResolvedValue({ id: 'gd-1' });

      await service.signViaRequest('req-1', { signatureImage: 'data:image/png;base64,AAA' } as any);

      expect(mockPrisma.documentSignature.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: SignatureStatus.SIGNED }) }),
      );
      expect(mockPrisma.generatedDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: GeneratedDocumentStatus.SIGNED } }),
      );
    });
  });
});

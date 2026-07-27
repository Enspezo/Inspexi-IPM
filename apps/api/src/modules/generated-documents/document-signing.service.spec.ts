import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentType, GeneratedDocumentStatus, SignatureStatus, Role } from '@prisma/client';
import { DocumentSigningService } from './document-signing.service';
import { GeneratedDocumentsService } from './generated-documents.service';
import { PrismaService } from '@/prisma';
import { EmailService } from '@/common/services/email.service';
import { LookupService } from '../lookups/lookup.service';

describe('DocumentSigningService', () => {
  let service: DocumentSigningService;

  const mockPrisma = {
    generatedDocument: { findUnique: jest.fn(), update: jest.fn() },
    documentSignature: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockEmail = { sendNotificationEmail: jest.fn() };
  const mockLookups = { resolveLookup: jest.fn() };
  const mockConfig = { get: jest.fn((_k: string, def?: string) => def) };
  // Org-scoped document fetch is delegated to the core service (sub-service pattern).
  const mockDocuments = { findById: jest.fn() };

  const user = {
    id: 'user-1',
    orgId: 'org-1',
    firstName: 'Inge',
    lastName: 'Specteur',
    email: 'inge@org1.nl',
    roles: [Role.MANAGER],
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEmail.sendNotificationEmail.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentSigningService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: mockEmail },
        { provide: ConfigService, useValue: mockConfig },
        { provide: LookupService, useValue: mockLookups },
        { provide: GeneratedDocumentsService, useValue: mockDocuments },
      ],
    }).compile();

    service = module.get<DocumentSigningService>(DocumentSigningService);
  });

  describe('requestSignature', () => {
    const doc = { id: 'gd-1', orgId: 'org-1', status: GeneratedDocumentStatus.DRAFT };

    it('validates the role, creates a REQUESTED signature, mails the link and flips status', async () => {
      mockDocuments.findById.mockResolvedValue(doc);
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
      mockDocuments.findById.mockResolvedValue(doc);
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

  // WP-A3 (B-101): interne ondertekenroute — rolcode-validatie, stafrol-mapping,
  // claim van de bestaande open rij en herleidbaarheid (signedByUserId/IP).
  describe('signDocument', () => {
    const doc = { id: 'gd-1', orgId: 'org-1', status: GeneratedDocumentStatus.PENDING_SIGNATURES };
    const inspecteur = { ...user, id: 'user-insp', roles: [Role.INSPECTEUR] };
    const backoffice = { ...user, id: 'user-bo', roles: [Role.BACKOFFICE] };
    const signDto = (signerRoleCode: string) =>
      ({ signerRoleCode, signatureImage: 'data:image/png;base64,AAA' }) as any;

    beforeEach(() => {
      mockDocuments.findById.mockResolvedValue(doc);
      mockPrisma.documentSignature.findMany.mockResolvedValue([]);
      mockPrisma.documentSignature.create.mockImplementation(({ data }: any) => ({ id: 'sig-new', ...data }));
      mockPrisma.documentSignature.update.mockImplementation(({ data }: any) => ({ id: 'sig-upd', ...data }));
    });

    it('rejects an unknown signer role code (400)', async () => {
      mockLookups.resolveLookup.mockResolvedValue(null);
      await expect(service.signDocument('gd-1', inspecteur, signDto('BESTAAT-NIET'))).rejects.toThrow(
        BadRequestException,
      );
      expect(mockLookups.resolveLookup).toHaveBeenCalledWith('signer-roles', 'BESTAAT-NIET', 'org-1');
      expect(mockPrisma.documentSignature.create).not.toHaveBeenCalled();
    });

    it('rejects an INSPECTEUR signing as CLIENT — external roles only via a signature request (403)', async () => {
      mockLookups.resolveLookup.mockResolvedValue({ code: 'CLIENT', label: 'Opdrachtgever' });
      await expect(service.signDocument('gd-1', inspecteur, signDto('CLIENT'))).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.signDocument('gd-1', inspecteur, signDto('CLIENT'))).rejects.toThrow(
        /ondertekenverzoek/,
      );
      expect(mockPrisma.documentSignature.create).not.toHaveBeenCalled();
    });

    it('rejects an INSPECTEUR signing as REVIEWER (vier-ogen) (403)', async () => {
      mockLookups.resolveLookup.mockResolvedValue({ code: 'REVIEWER', label: 'Beoordelaar' });
      await expect(service.signDocument('gd-1', inspecteur, signDto('REVIEWER'))).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.documentSignature.create).not.toHaveBeenCalled();
    });

    it('rejects BACKOFFICE for any internal signer role (403)', async () => {
      mockLookups.resolveLookup.mockResolvedValue({ code: 'INSPECTOR', label: 'Inspecteur' });
      await expect(service.signDocument('gd-1', backoffice, signDto('INSPECTOR'))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lets an INSPECTEUR sign as INSPECTOR and records userId + IP', async () => {
      mockLookups.resolveLookup.mockResolvedValue({ code: 'INSPECTOR', label: 'Inspecteur' });

      const sig = await service.signDocument('gd-1', inspecteur, signDto('INSPECTOR'), '10.0.0.7');

      expect(mockPrisma.documentSignature.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            generatedDocumentId: 'gd-1',
            signerRoleCode: 'INSPECTOR',
            status: SignatureStatus.SIGNED,
            signedByUserId: 'user-insp',
            signedIpAddress: '10.0.0.7',
            signerEmail: inspecteur.email,
          }),
        }),
      );
      expect(sig.status).toBe(SignatureStatus.SIGNED);
    });

    it('lets a MANAGER (REVIEW_ROLES) sign as REVIEWER', async () => {
      mockLookups.resolveLookup.mockResolvedValue({ code: 'REVIEWER', label: 'Beoordelaar' });
      await service.signDocument('gd-1', user, signDto('REVIEWER'));
      expect(mockPrisma.documentSignature.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ signerRoleCode: 'REVIEWER', status: SignatureStatus.SIGNED }),
        }),
      );
    });

    it('claims the existing REQUESTED row instead of inserting a second one', async () => {
      mockLookups.resolveLookup.mockResolvedValue({ code: 'INSPECTOR', label: 'Inspecteur' });
      mockPrisma.documentSignature.findMany.mockResolvedValue([
        { id: 'sig-open', status: SignatureStatus.REQUESTED, signerRoleCode: 'INSPECTOR' },
      ]);

      await service.signDocument('gd-1', inspecteur, signDto('INSPECTOR'), '10.0.0.7');

      expect(mockPrisma.documentSignature.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sig-open' },
          data: expect.objectContaining({
            status: SignatureStatus.SIGNED,
            signedByUserId: 'user-insp',
          }),
        }),
      );
      expect(mockPrisma.documentSignature.create).not.toHaveBeenCalled();
    });

    it('rejects a second signature for an already SIGNED role (400)', async () => {
      mockLookups.resolveLookup.mockResolvedValue({ code: 'INSPECTOR', label: 'Inspecteur' });
      mockPrisma.documentSignature.findMany.mockResolvedValue([
        { id: 'sig-done', status: SignatureStatus.SIGNED, signerRoleCode: 'INSPECTOR' },
      ]);

      await expect(service.signDocument('gd-1', inspecteur, signDto('INSPECTOR'))).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.documentSignature.create).not.toHaveBeenCalled();
      expect(mockPrisma.documentSignature.update).not.toHaveBeenCalled();
    });

    it('rejects signing a FINALIZED document (400)', async () => {
      mockDocuments.findById.mockResolvedValue({ ...doc, status: GeneratedDocumentStatus.FINALIZED });
      await expect(service.signDocument('gd-1', user, signDto('INSPECTOR'))).rejects.toThrow(
        BadRequestException,
      );
      expect(mockLookups.resolveLookup).not.toHaveBeenCalled();
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

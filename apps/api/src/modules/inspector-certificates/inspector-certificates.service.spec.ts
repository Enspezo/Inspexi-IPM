import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { InspectorCertificatesService } from './inspector-certificates.service';
import { PrismaService } from '@/prisma';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';

describe('InspectorCertificatesService', () => {
  let service: InspectorCertificatesService;

  const mockPrisma = {
    inspectorCertificate: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  };

  const mockStorage = {
    upload: jest.fn(),
    download: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
  };

  const ORG = 'org-1';
  const u = (id: string, roles: Role[], orgId: string | null = ORG) =>
    ({ id, orgId, roles, email: `${id}@test.nl` }) as any;

  const admin = u('admin-1', [Role.ORG_ADMIN]);
  const manager = u('mgr-1', [Role.MANAGER]);
  const inspector = u('insp-1', [Role.INSPECTEUR]);
  const otherInspector = u('insp-2', [Role.INSPECTEUR]);
  const backoffice = u('bo-1', [Role.BACKOFFICE]);
  const superuser = u('su-1', [Role.SUPERUSER], null);

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspectorCertificatesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: STORAGE_PROVIDER, useValue: mockStorage },
      ],
    }).compile();
    service = module.get(InspectorCertificatesService);
  });

  // ─── Permission matrix ─────────────────────────────────

  describe('canView (self ∥ {SUPERUSER, ORG_ADMIN, MANAGER})', () => {
    it('allows self for any role', () => {
      expect(service.canView(inspector, inspector.id)).toBe(true);
      expect(service.canView(backoffice, backoffice.id)).toBe(true);
    });
    it('allows SUPERUSER, ORG_ADMIN and MANAGER for others', () => {
      expect(service.canView(superuser, inspector.id)).toBe(true);
      expect(service.canView(admin, inspector.id)).toBe(true);
      expect(service.canView(manager, inspector.id)).toBe(true);
    });
    it('denies INSPECTEUR and BACKOFFICE for others', () => {
      expect(service.canView(inspector, otherInspector.id)).toBe(false);
      expect(service.canView(backoffice, inspector.id)).toBe(false);
    });
  });

  describe('canWrite (self ∥ {SUPERUSER, ORG_ADMIN})', () => {
    it('allows self for any role', () => {
      expect(service.canWrite(inspector, inspector.id)).toBe(true);
    });
    it('allows SUPERUSER and ORG_ADMIN for others', () => {
      expect(service.canWrite(superuser, inspector.id)).toBe(true);
      expect(service.canWrite(admin, inspector.id)).toBe(true);
    });
    it('denies MANAGER for others (MANAGER is read-only)', () => {
      expect(service.canWrite(manager, inspector.id)).toBe(false);
    });
    it('denies INSPECTEUR and BACKOFFICE for others', () => {
      expect(service.canWrite(inspector, otherInspector.id)).toBe(false);
      expect(service.canWrite(backoffice, inspector.id)).toBe(false);
    });
  });

  // ─── Reads & org-scope ─────────────────────────────────

  describe('findAll', () => {
    beforeEach(() => {
      mockPrisma.inspectorCertificate.findMany.mockResolvedValue([]);
      mockPrisma.inspectorCertificate.count.mockResolvedValue(0);
    });

    it('scopes a non-management user to their own certificates when no userId is given', async () => {
      await service.findAll(inspector, {});
      expect(mockPrisma.inspectorCertificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: inspector.id, orgId: ORG, isDeleted: false }),
        }),
      );
    });

    it('lets management list all inspectors (no userId filter) within the org', async () => {
      await service.findAll(manager, {});
      const arg = mockPrisma.inspectorCertificate.findMany.mock.calls[0][0];
      expect(arg.where).toEqual(expect.objectContaining({ orgId: ORG, isDeleted: false }));
      expect(arg.where.userId).toBeUndefined();
    });

    it('forbids an inspector from listing another inspector by userId', async () => {
      await expect(
        service.findAll(inspector, { userId: otherInspector.id }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('returns 404 for a certificate in another org (no existence leak)', async () => {
      mockPrisma.inspectorCertificate.findUnique.mockResolvedValue({
        id: 'c1',
        orgId: 'org-2',
        userId: 'x',
        isDeleted: false,
        storageKey: null,
      });
      await expect(service.findOne('c1', admin)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids an inspector from viewing another inspector’s certificate', async () => {
      mockPrisma.inspectorCertificate.findUnique.mockResolvedValue({
        id: 'c1',
        orgId: ORG,
        userId: otherInspector.id,
        isDeleted: false,
        storageKey: null,
      });
      await expect(service.findOne('c1', inspector)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('omits storageKey and exposes hasDocument', async () => {
      mockPrisma.inspectorCertificate.findUnique.mockResolvedValue({
        id: 'c1',
        orgId: ORG,
        userId: inspector.id,
        isDeleted: false,
        storageKey: 'org-1/inspector-certificates/insp-1/abc.pdf',
        originalName: 'abc.pdf',
      });
      const result = await service.findOne('c1', inspector);
      expect((result as any).storageKey).toBeUndefined();
      expect(result.hasDocument).toBe(true);
    });
  });

  // ─── Writes ────────────────────────────────────────────

  describe('create', () => {
    it('forbids a MANAGER from creating for another inspector (read-only)', async () => {
      await expect(
        service.create(undefined, { userId: inspector.id, type: 'VCA', issueDate: '2024-01-01', issuer: 'X' } as any, manager),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.inspectorCertificate.create).not.toHaveBeenCalled();
    });

    it('forbids an inspector from creating for another inspector', async () => {
      await expect(
        service.create(undefined, { userId: otherInspector.id, type: 'VCA', issueDate: '2024-01-01', issuer: 'X' } as any, inspector),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets an inspector create their own certificate (no file → hasDocument false)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: inspector.id, orgId: ORG });
      mockPrisma.inspectorCertificate.create.mockResolvedValue({
        id: 'c1',
        orgId: ORG,
        userId: inspector.id,
        type: 'VCA',
        issuer: 'X',
        storageKey: null,
      });
      const result = await service.create(
        undefined,
        { userId: inspector.id, type: 'VCA', issueDate: '2024-01-01', issuer: 'X' } as any,
        inspector,
      );
      expect(result.hasDocument).toBe(false);
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('rejects an ORG_ADMIN creating for a user in another org (cross-tenant)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'foreign', orgId: 'org-2' });
      await expect(
        service.create(undefined, { userId: 'foreign', type: 'VCA', issueDate: '2024-01-01', issuer: 'X' } as any, admin),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('remove (soft-delete + storage cleanup)', () => {
    it('sets isDeleted and deletes the stored file', async () => {
      mockPrisma.inspectorCertificate.findUnique.mockResolvedValue({
        id: 'c1',
        orgId: ORG,
        userId: inspector.id,
        isDeleted: false,
        storageKey: 'org-1/inspector-certificates/insp-1/abc.pdf',
      });
      mockPrisma.inspectorCertificate.update.mockResolvedValue({});
      await service.remove('c1', admin);
      expect(mockStorage.delete).toHaveBeenCalledWith('org-1/inspector-certificates/insp-1/abc.pdf');
      expect(mockPrisma.inspectorCertificate.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c1' }, data: { isDeleted: true, storageKey: null } }),
      );
    });

    it('forbids a MANAGER from deleting', async () => {
      mockPrisma.inspectorCertificate.findUnique.mockResolvedValue({
        id: 'c1',
        orgId: ORG,
        userId: inspector.id,
        isDeleted: false,
        storageKey: null,
      });
      await expect(service.remove('c1', manager)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ─── Suggestions ───────────────────────────────────────

  describe('getSuggestions', () => {
    it('returns distinct issuer values within the org', async () => {
      mockPrisma.inspectorCertificate.findMany.mockResolvedValue([
        { issuer: 'VCA Examenbureau' },
        { issuer: 'Hoogspanning Opleidingen B.V.' },
      ]);
      const result = await service.getSuggestions(admin, 'issuer', 'va');
      expect(result).toEqual(['VCA Examenbureau', 'Hoogspanning Opleidingen B.V.']);
      expect(mockPrisma.inspectorCertificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          distinct: ['issuer'],
          where: expect.objectContaining({
            orgId: ORG,
            isDeleted: false,
            issuer: { contains: 'va', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('returns distinct type values (no query filter)', async () => {
      mockPrisma.inspectorCertificate.findMany.mockResolvedValue([{ type: 'VCA-VOL' }]);
      const result = await service.getSuggestions(inspector, 'type');
      expect(result).toEqual(['VCA-VOL']);
      const arg = mockPrisma.inspectorCertificate.findMany.mock.calls[0][0];
      expect(arg.distinct).toEqual(['type']);
      expect(arg.where.type).toBeUndefined();
    });
  });
});

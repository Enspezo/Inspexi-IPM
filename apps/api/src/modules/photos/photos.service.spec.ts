import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role, PhotoEntityType } from '@prisma/client';
import { PhotosService } from './photos.service';
import { PrismaService } from '@/prisma';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';

describe('PhotosService', () => {
  let service: PhotosService;

  const mockPrisma = {
    asset: { findFirst: jest.fn(), create: jest.fn() },
    finding: { findFirst: jest.fn(), create: jest.fn() },
    inspectionPlan: { findFirst: jest.fn(), create: jest.fn() },
    photo: { findFirst: jest.fn(), create: jest.fn() },
  };

  const mockStorage = {
    upload: jest.fn(),
    download: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
  };

  const user = { id: 'user-1', orgId: 'org-1', roles: [Role.INSPECTEUR] } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhotosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: STORAGE_PROVIDER, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<PhotosService>(PhotosService);
  });

  describe('upload', () => {
    const file = { buffer: Buffer.from('x'), mimetype: 'image/jpeg', size: 100 };

    it('should upload a photo for an asset entity', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.photo.create.mockResolvedValue({ id: 'photo-1' });

      const result = await service.upload(
        file,
        { entityType: 'asset', entityId: 'a1' } as any,
        user,
      );

      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      expect(mockStorage.upload.mock.calls[0][0]).toMatch(/^org-1\/photos\/.+\.jpg$/);

      expect(mockPrisma.photo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            entityType: PhotoEntityType.asset,
            storagePath: expect.any(String),
          }),
        }),
      );

      expect(result).toEqual({
        id: 'photo-1',
        url: '/api/v1/photos/photo-1/download',
        thumbnailUrl: '/api/v1/photos/photo-1/download?thumb=1',
      });
    });

    it('should reject a disallowed MIME type and not call storage', async () => {
      await expect(
        service.upload(
          { buffer: Buffer.from('x'), mimetype: 'application/pdf', size: 100 },
          { entityType: 'asset', entityId: 'a1' } as any,
          user,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('should reject when no file is provided', async () => {
      await expect(
        service.upload(
          undefined as any,
          { entityType: 'asset', entityId: 'a1' } as any,
          user,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('should map inspectionPlan wire type to inspection_plan enum and use inspectionPlan delegate', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.photo.create.mockResolvedValue({ id: 'photo-2' });

      await service.upload(
        file,
        { entityType: 'inspectionPlan', entityId: 'p1' } as any,
        user,
      );

      expect(mockPrisma.inspectionPlan.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrisma.asset.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.photo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entityType: PhotoEntityType.inspection_plan,
          }),
        }),
      );
    });

    it('should throw NotFoundException when entity is missing or cross-org', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue(null);

      await expect(
        service.upload(
          file,
          { entityType: 'asset', entityId: 'a1' } as any,
          user,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockStorage.upload).not.toHaveBeenCalled();
    });
  });

  describe('getFile', () => {
    it('should return buffer and mimeType for an org-scoped photo', async () => {
      mockPrisma.photo.findFirst.mockResolvedValue({
        storagePath: 'org-1/photos/x.jpg',
        mimeType: 'image/jpeg',
      });
      mockStorage.download.mockResolvedValue(Buffer.from('img'));

      const result = await service.getFile('photo-1', user);

      expect(mockStorage.download).toHaveBeenCalledWith('org-1/photos/x.jpg');
      expect(result.mimeType).toBe('image/jpeg');
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
    });

    it('should throw NotFoundException when photo is missing or other org', async () => {
      mockPrisma.photo.findFirst.mockResolvedValue(null);

      await expect(service.getFile('photo-1', user)).rejects.toThrow(NotFoundException);
      expect(mockStorage.download).not.toHaveBeenCalled();
    });
  });
});

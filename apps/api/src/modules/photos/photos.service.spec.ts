import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role, PhotoEntityType } from '@prisma/client';
import { PhotosService } from './photos.service';
import { PrismaService } from '@/prisma';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import { makeThumbnail } from './thumbnail.util';

jest.mock('./thumbnail.util');
const mockMakeThumbnail = makeThumbnail as jest.MockedFunction<typeof makeThumbnail>;

describe('PhotosService', () => {
  let service: PhotosService;

  const mockPrisma = {
    assetNode: { findFirst: jest.fn() },
    finding: { findFirst: jest.fn() },
    inspectionPlan: { findFirst: jest.fn() },
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
    mockMakeThumbnail.mockResolvedValue(Buffer.from('thumb'));

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
    // Echte JPEG magic bytes (FF D8 FF) + vulling ≥ 12 bytes — de upload
    // valideert sinds WP-B4 op inhoud, niet op de geclaimde mimetype.
    const file = {
      buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('img-bytes')]),
      mimetype: 'image/jpeg',
      size: 100,
    };

    it('uploads the original + a thumbnail and stores the thumbnail path', async () => {
      mockPrisma.assetNode.findFirst.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.photo.create.mockResolvedValue({ id: 'photo-1' });

      const result = await service.upload(file, { entityType: 'asset', entityId: 'a1' } as any, user);

      expect(mockMakeThumbnail).toHaveBeenCalledTimes(1);
      expect(mockStorage.upload).toHaveBeenCalledTimes(2);
      const origKey = mockStorage.upload.mock.calls[0][0] as string;
      const [thumbKey, , thumbMime] = mockStorage.upload.mock.calls[1];
      expect(origKey).toMatch(/^org-1\/photos\/.+\.jpg$/);
      expect(thumbKey).toMatch(/^org-1\/photos\/thumb\/.+\.jpg$/);
      expect(thumbMime).toBe('image/jpeg');

      expect(mockPrisma.photo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            entityType: PhotoEntityType.asset,
            storagePath: origKey,
            thumbnailPath: thumbKey,
          }),
        }),
      );

      expect(result).toEqual({
        id: 'photo-1',
        url: '/api/v1/photos/photo-1/download',
        thumbnailUrl: '/api/v1/photos/photo-1/download?thumb=1',
      });
    });

    it('falls back to the original key when thumbnail generation fails (fail-soft)', async () => {
      mockPrisma.assetNode.findFirst.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.photo.create.mockResolvedValue({ id: 'photo-x' });
      mockMakeThumbnail.mockRejectedValueOnce(new Error('Input buffer contains unsupported image format'));

      await service.upload(file, { entityType: 'asset', entityId: 'a1' } as any, user);

      expect(mockStorage.upload).toHaveBeenCalledTimes(1); // alleen het origineel
      const createArg = mockPrisma.photo.create.mock.calls[0][0];
      expect(createArg.data.thumbnailPath).toBe(createArg.data.storagePath);
    });

    it('rejects a disallowed MIME type and does not touch storage', async () => {
      await expect(
        service.upload(
          { buffer: Buffer.from('x'), mimetype: 'application/pdf', size: 100 } as any,
          { entityType: 'asset', entityId: 'a1' } as any,
          user,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('rejects when no file is provided', async () => {
      await expect(
        service.upload(undefined as any, { entityType: 'asset', entityId: 'a1' } as any, user),
      ).rejects.toThrow(BadRequestException);
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('maps the inspectionPlan wire type to the inspection_plan enum', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.photo.create.mockResolvedValue({ id: 'photo-2' });

      await service.upload(file, { entityType: 'inspectionPlan', entityId: 'p1' } as any, user);

      expect(mockPrisma.inspectionPlan.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrisma.assetNode.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.photo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entityType: PhotoEntityType.inspection_plan }),
        }),
      );
    });

    it('throws NotFoundException when the entity is missing or cross-org', async () => {
      mockPrisma.assetNode.findFirst.mockResolvedValue(null);
      await expect(
        service.upload(file, { entityType: 'asset', entityId: 'a1' } as any, user),
      ).rejects.toThrow(NotFoundException);
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });
  });

  describe('getFile', () => {
    it('returns the original file + its mime when no thumbnail is requested', async () => {
      mockPrisma.photo.findFirst.mockResolvedValue({
        storagePath: 'org-1/photos/x.png',
        thumbnailPath: 'org-1/photos/thumb/x.jpg',
        mimeType: 'image/png',
      });
      mockStorage.download.mockResolvedValue(Buffer.from('img'));

      const result = await service.getFile('photo-1', user);

      expect(mockStorage.download).toHaveBeenCalledWith('org-1/photos/x.png');
      expect(result.mimeType).toBe('image/png');
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
    });

    it('serves the JPEG thumbnail when thumb is requested', async () => {
      mockPrisma.photo.findFirst.mockResolvedValue({
        storagePath: 'org-1/photos/x.png',
        thumbnailPath: 'org-1/photos/thumb/x.jpg',
        mimeType: 'image/png',
      });
      mockStorage.download.mockResolvedValue(Buffer.from('thumb'));

      const result = await service.getFile('photo-1', user, true);

      expect(mockStorage.download).toHaveBeenCalledWith('org-1/photos/thumb/x.jpg');
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('falls back to the original when the thumbnail equals the original key', async () => {
      mockPrisma.photo.findFirst.mockResolvedValue({
        storagePath: 'org-1/photos/x.jpg',
        thumbnailPath: 'org-1/photos/x.jpg',
        mimeType: 'image/jpeg',
      });
      mockStorage.download.mockResolvedValue(Buffer.from('img'));

      const result = await service.getFile('photo-1', user, true);

      expect(mockStorage.download).toHaveBeenCalledWith('org-1/photos/x.jpg');
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('throws NotFoundException when the photo is missing or other org', async () => {
      mockPrisma.photo.findFirst.mockResolvedValue(null);
      await expect(service.getFile('photo-1', user)).rejects.toThrow(NotFoundException);
      expect(mockStorage.download).not.toHaveBeenCalled();
    });
  });
});

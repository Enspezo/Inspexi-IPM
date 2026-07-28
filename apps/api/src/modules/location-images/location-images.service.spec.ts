import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role, MarkerType, FindingInspectionType } from '@prisma/client';
import { LocationImagesService } from './location-images.service';
import { PrismaService } from '@/prisma';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import { AssetsService } from '../assets/assets.service';
import { FindingsService } from '../findings/findings.service';
import { StandaloneMeasurementsService } from '../standalone-measurements/standalone-measurements.service';

describe('LocationImagesService', () => {
  let service: LocationImagesService;

  const mockPrisma = {
    assetNode: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    locationImage: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    locationImageMarker: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    finding: { findUnique: jest.fn() },
    standaloneMeasurement: { findUnique: jest.fn() },
  };

  const mockStorage = {
    upload: jest.fn(),
    download: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
  };

  const mockAssets = { create: jest.fn() };
  const mockFindings = { create: jest.fn() };
  const mockMeasurements = { create: jest.fn() };

  const user = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.nl',
    roles: [Role.ORG_ADMIN],
  } as any;

  // A LOCATION node belonging to org-1.
  const location = { id: 'loc-1', orgId: 'org-1', nodeType: 'LOCATION', deletedAt: null };
  // An image whose parent LOCATION node is in org-1 and scoped to plan-1.
  const imageWithLocation = {
    id: 'img-1',
    orgId: 'org-1',
    storagePath: 'org-1/old.png',
    thumbnailPath: null,
    node: {
      id: 'loc-1',
      orgId: 'org-1',
      planScopes: [{ inspectionPlanId: 'plan-1', isPrimary: true }],
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Storage methods resolve by default (service uses `.catch()` on delete).
    mockStorage.upload.mockResolvedValue(undefined);
    mockStorage.download.mockResolvedValue(Buffer.from(''));
    mockStorage.delete.mockResolvedValue(undefined);
    mockStorage.exists.mockResolvedValue(true);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        LocationImagesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: STORAGE_PROVIDER, useValue: mockStorage },
        { provide: AssetsService, useValue: mockAssets },
        { provide: FindingsService, useValue: mockFindings },
        { provide: StandaloneMeasurementsService, useValue: mockMeasurements },
      ],
    }).compile();

    service = moduleRef.get<LocationImagesService>(LocationImagesService);
  });

  // ── uploadImage ──
  describe('uploadImage', () => {
    // Echte PNG magic bytes — de upload valideert sinds WP-B4 op inhoud en
    // bepaalt daaruit ook de opslagextensie (niet meer uit `originalname`).
    const pngBuffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from([0x00, 0x00, 0x00, 0x0d]),
    ]);
    const file = {
      originalname: 'plan.png',
      buffer: pngBuffer,
      mimetype: 'image/png',
      size: pngBuffer.length,
    } as Express.Multer.File;

    it('uploads with the org-scoped key pattern and upserts (no existing image)', async () => {
      mockPrisma.assetNode.findFirst.mockResolvedValue(location);
      mockPrisma.locationImage.findUnique.mockResolvedValue(null);
      mockPrisma.locationImage.upsert.mockImplementation(({ create }: any) => ({
        id: 'img-1',
        ...create,
      }));

      const result = await service.uploadImage('loc-1', user, file, 'device-9');

      // storage.upload called with key `${orgId}/${uuid}.{ext}` — extensie uit
      // de gedetecteerde inhoud, niet uit `originalname` (WP-B4)
      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      const [key, buffer, mime] = mockStorage.upload.mock.calls[0];
      expect(key).toMatch(/^org-1\/[0-9a-f-]{36}\.png$/);
      expect(buffer).toBe(file.buffer);
      expect(mime).toBe('image/png');

      // upsert with denormalised orgId + deviceId + storagePath === uploaded key
      const upsertArg = mockPrisma.locationImage.upsert.mock.calls[0][0];
      expect(upsertArg.where).toEqual({ nodeId: 'loc-1' });
      expect(upsertArg.create.orgId).toBe('org-1');
      expect(upsertArg.create.deviceId).toBe('device-9');
      expect(upsertArg.create.storagePath).toBe(key);
      expect(result.id).toBe('img-1');
    });

    it('deletes the previous file from storage before re-uploading', async () => {
      mockPrisma.assetNode.findFirst.mockResolvedValue(location);
      mockPrisma.locationImage.findUnique.mockResolvedValue({
        id: 'img-1',
        storagePath: 'org-1/old.png',
        thumbnailPath: 'org-1/old-thumb.png',
      });
      mockPrisma.locationImage.upsert.mockResolvedValue({ id: 'img-1' });

      await service.uploadImage('loc-1', user, file);

      expect(mockStorage.delete).toHaveBeenCalledWith('org-1/old.png');
      expect(mockStorage.delete).toHaveBeenCalledWith('org-1/old-thumb.png');
      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
    });

    it('throws 404 when the location is not in the org', async () => {
      mockPrisma.assetNode.findFirst.mockResolvedValue(null);

      await expect(service.uploadImage('loc-x', user, file)).rejects.toThrow(NotFoundException);
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });
  });

  // ── getImageByLocation / getLocationInOrg ──
  describe('getImageByLocation', () => {
    it('throws 404 (Locatie) when the location is not in the org', async () => {
      mockPrisma.assetNode.findFirst.mockResolvedValue(null);

      await expect(service.getImageByLocation('loc-x', user)).rejects.toThrow(NotFoundException);
    });

    it('returns the image with markers when present', async () => {
      mockPrisma.assetNode.findFirst.mockResolvedValue(location);
      mockPrisma.locationImage.findUnique.mockResolvedValue({ id: 'img-1', markers: [] });

      const result = await service.getImageByLocation('loc-1', user);
      expect(result.id).toBe('img-1');
    });
  });

  // ── deleteImage ──
  describe('deleteImage', () => {
    it('deletes storage file then the db record', async () => {
      mockPrisma.assetNode.findFirst.mockResolvedValue(location);
      mockPrisma.locationImage.findUnique.mockResolvedValue({
        id: 'img-1',
        storagePath: 'org-1/x.png',
        thumbnailPath: null,
      });
      mockPrisma.locationImage.delete.mockResolvedValue({});

      const result = await service.deleteImage('loc-1', user);

      expect(mockStorage.delete).toHaveBeenCalledWith('org-1/x.png');
      expect(mockPrisma.locationImage.delete).toHaveBeenCalledWith({
        where: { nodeId: 'loc-1' },
      });
      expect(result).toEqual({ deleted: true });
    });
  });

  // ── createMarker (FK validation + assertSameOrg) ──
  describe('createMarker', () => {
    beforeEach(() => {
      mockPrisma.locationImage.findFirst.mockResolvedValue(imageWithLocation);
      mockPrisma.locationImageMarker.create.mockImplementation(({ data }: any) => ({
        id: 'marker-1',
        ...data,
      }));
    });

    it('creates an ASSET marker after asserting the asset is in the same org', async () => {
      mockPrisma.assetNode.findUnique.mockResolvedValue({ orgId: 'org-1' });

      const result = await service.createMarker(
        'img-1',
        user,
        { positionX: 10, positionY: 20, markerType: MarkerType.ASSET, assetId: 'asset-1' },
        'device-1',
      );

      expect(mockPrisma.assetNode.findUnique).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        select: { orgId: true },
      });
      const data = mockPrisma.locationImageMarker.create.mock.calls[0][0].data;
      expect(data.orgId).toBe('org-1');
      expect(data.markerType).toBe(MarkerType.ASSET);
      expect(data.assetNodeId).toBe('asset-1');
      expect(data.deviceId).toBe('device-1');
      expect(result.id).toBe('marker-1');
    });

    it('throws 403 when the asset belongs to another org', async () => {
      mockPrisma.assetNode.findUnique.mockResolvedValue({ orgId: 'org-2' });

      await expect(
        service.createMarker('img-1', user, {
          positionX: 1,
          positionY: 1,
          markerType: MarkerType.ASSET,
          assetId: 'asset-foreign',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.locationImageMarker.create).not.toHaveBeenCalled();
    });

    it('rejects an ASSET marker that is missing assetId (FK shape check)', async () => {
      await expect(
        service.createMarker('img-1', user, {
          positionX: 1,
          positionY: 1,
          markerType: MarkerType.ASSET,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a FINDING marker that also carries an assetId', async () => {
      await expect(
        service.createMarker('img-1', user, {
          positionX: 1,
          positionY: 1,
          markerType: MarkerType.FINDING,
          findingId: 'finding-1',
          assetId: 'asset-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 404 when the image is not reachable in the org', async () => {
      mockPrisma.locationImage.findFirst.mockResolvedValue(null);

      await expect(
        service.createMarker('img-x', user, {
          positionX: 1,
          positionY: 1,
          markerType: MarkerType.MEASUREMENT,
          standaloneMeasurementId: 'm-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── quick-create flows ──
  describe('quickCreateAsset', () => {
    it('creates an asset via AssetsService, links the location, and creates an ASSET marker', async () => {
      mockPrisma.locationImage.findFirst.mockResolvedValue(imageWithLocation);
      mockAssets.create.mockResolvedValue({ id: 'asset-new' });
      mockPrisma.assetNode.update.mockResolvedValue({});
      mockPrisma.locationImageMarker.create.mockImplementation(({ data }: any) => ({
        id: 'marker-2',
        ...data,
      }));

      const result = await service.quickCreateAsset(
        'img-1',
        user,
        { positionX: 5, positionY: 6, assetType: 'verdeler', name: 'V1' },
        'device-2',
      );

      // AssetsService.create called with the image's plan id + (user, dto, deviceId)
      expect(mockAssets.create).toHaveBeenCalledWith(
        'plan-1',
        user,
        expect.objectContaining({ assetType: 'verdeler', name: 'V1' }),
        'device-2',
      );
      // node attached under the LOCATION node after create
      expect(mockPrisma.assetNode.update).toHaveBeenCalledWith({
        where: { id: 'asset-new' },
        data: { parentId: 'loc-1' },
      });
      const markerData = mockPrisma.locationImageMarker.create.mock.calls[0][0].data;
      expect(markerData.markerType).toBe(MarkerType.ASSET);
      expect(markerData.assetNodeId).toBe('asset-new');
      expect(markerData.orgId).toBe('org-1');
      expect(result.asset.id).toBe('asset-new');
      expect(result.marker.id).toBe('marker-2');
    });
  });

  describe('quickCreateMeasurement', () => {
    it('creates a measurement via the service (with location) and a MEASUREMENT marker', async () => {
      mockPrisma.locationImage.findFirst.mockResolvedValue(imageWithLocation);
      mockMeasurements.create.mockResolvedValue({ id: 'meas-new' });
      mockPrisma.locationImageMarker.create.mockImplementation(({ data }: any) => ({
        id: 'marker-3',
        ...data,
      }));

      const result = await service.quickCreateMeasurement(
        'img-1',
        user,
        { positionX: 7, positionY: 8, measurementType: 'isolatiemeting' },
        'device-3',
      );

      expect(mockMeasurements.create).toHaveBeenCalledWith(
        'plan-1',
        user,
        expect.objectContaining({ locationId: 'loc-1', measurementType: 'isolatiemeting' }),
        'device-3',
      );
      const markerData = mockPrisma.locationImageMarker.create.mock.calls[0][0].data;
      expect(markerData.markerType).toBe(MarkerType.MEASUREMENT);
      expect(markerData.standaloneMeasurementId).toBe('meas-new');
      expect(result.measurement.id).toBe('meas-new');
      expect(result.marker.id).toBe('marker-3');
    });
  });

  describe('quickCreateFinding', () => {
    it('asserts the asset org, creates a finding via FindingsService, and a FINDING marker', async () => {
      mockPrisma.locationImage.findFirst.mockResolvedValue(imageWithLocation);
      mockPrisma.assetNode.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockFindings.create.mockResolvedValue({ id: 'finding-new' });
      mockPrisma.locationImageMarker.create.mockImplementation(({ data }: any) => ({
        id: 'marker-4',
        ...data,
      }));

      const result = await service.quickCreateFinding(
        'img-1',
        user,
        {
          positionX: 9,
          positionY: 10,
          assetId: 'asset-1',
          inspectionType: FindingInspectionType.visual,
          shortDescription: 'Gebrek',
        },
        'device-4',
      );

      expect(mockPrisma.assetNode.findUnique).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        select: { orgId: true },
      });
      expect(mockFindings.create).toHaveBeenCalledWith(
        'asset-1',
        user,
        expect.objectContaining({
          inspectionType: FindingInspectionType.visual,
          shortDescription: 'Gebrek',
        }),
        'device-4',
      );
      const markerData = mockPrisma.locationImageMarker.create.mock.calls[0][0].data;
      expect(markerData.markerType).toBe(MarkerType.FINDING);
      expect(markerData.findingId).toBe('finding-new');
      expect(result.finding.id).toBe('finding-new');
      expect(result.marker.id).toBe('marker-4');
    });

    it('throws 403 (and does not create a finding) when the asset is in another org', async () => {
      mockPrisma.locationImage.findFirst.mockResolvedValue(imageWithLocation);
      mockPrisma.assetNode.findUnique.mockResolvedValue({ orgId: 'org-2' });

      await expect(
        service.quickCreateFinding('img-1', user, {
          positionX: 1,
          positionY: 1,
          assetId: 'asset-foreign',
          inspectionType: FindingInspectionType.visual,
          shortDescription: 'X',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockFindings.create).not.toHaveBeenCalled();
    });
  });
});

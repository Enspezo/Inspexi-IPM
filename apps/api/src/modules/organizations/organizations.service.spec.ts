import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import { TenantCacheService } from '@/common/services/tenant-cache.service';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { PrismaService } from '@/prisma';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: PrismaService;

  const mockOrganization = {
    id: 'org-1',
    name: 'Test Org',
    slug: 'test-org',
    isActive: true,
    logoUrl: null,
    primaryColor: '#1E40AF',
    defaultVat: 21,
    defaultValidityDays: 30,
    createdAt: new Date('2025-01-01'),
  };

  const mockPrismaService = {
    organization: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockStorage = {
    upload: jest.fn(),
    download: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: STORAGE_PROVIDER, useValue: mockStorage },
        TenantCacheService,
        {
          provide: EntitlementsService,
          useValue: { invalidate: jest.fn(), clear: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('create()', () => {
    const createDto = {
      name: 'New Org',
      slug: 'new-org',
      primaryColor: '#FF0000',
      defaultVat: 21,
      defaultValidityDays: 30,
    };

    it('should create org with valid data', async () => {
      const createdOrg = {
        id: 'org-2',
        ...createDto,
        logoUrl: null,
        createdAt: new Date(),
      };

      mockPrismaService.organization.findUnique.mockResolvedValue(null);
      mockPrismaService.organization.create.mockResolvedValue(createdOrg);

      const result = await service.create(createDto);

      expect(result).toEqual(createdOrg);
      expect(mockPrismaService.organization.findUnique).toHaveBeenCalledWith({
        where: { slug: createDto.slug },
      });
      expect(mockPrismaService.organization.create).toHaveBeenCalledWith({
        data: createDto,
      });
    });

    it('should throw ConflictException for duplicate slug', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(
        mockOrganization,
      );

      await expect(
        service.create({ ...createDto, slug: 'test-org' }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.create({ ...createDto, slug: 'test-org' }),
      ).rejects.toThrow('Slug is al in gebruik');
    });
  });

  describe('findAll()', () => {
    it('should return all orgs', async () => {
      const orgs = [
        mockOrganization,
        {
          ...mockOrganization,
          id: 'org-2',
          name: 'Another Org',
          slug: 'another-org',
        },
      ];
      mockPrismaService.organization.findMany.mockResolvedValue(orgs);

      const result = await service.findAll();

      expect(result).toEqual(orgs);
      expect(result).toHaveLength(2);
      expect(mockPrismaService.organization.findMany).toHaveBeenCalledWith({
        include: { _count: { select: { users: true } } },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne()', () => {
    it('should return org by ID', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(
        mockOrganization,
      );

      const result = await service.findOne('org-1');

      expect(result).toEqual(mockOrganization);
      expect(mockPrismaService.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        include: { _count: { select: { users: true } } },
      });
    });

    it('should throw NotFoundException for invalid ID', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('non-existent')).rejects.toThrow(
        'Organisatie niet gevonden',
      );
    });
  });

  describe('update()', () => {
    const updateDto = { name: 'Updated Org Name' };

    it('should update org fields', async () => {
      const updatedOrg = { ...mockOrganization, name: 'Updated Org Name' };

      // findOne is called internally via findOne(id), which calls findUnique
      mockPrismaService.organization.findUnique.mockResolvedValue(
        mockOrganization,
      );
      mockPrismaService.organization.update.mockResolvedValue(updatedOrg);

      const result = await service.update('org-1', updateDto);

      expect(result).toEqual(updatedOrg);
      expect(result.name).toBe('Updated Org Name');
      expect(mockPrismaService.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: updateDto,
      });
    });

    it('should throw NotFoundException for invalid ID', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(null);

      await expect(
        service.update('non-existent', updateDto),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.update('non-existent', updateDto),
      ).rejects.toThrow('Organisatie niet gevonden');
    });

    it('should throw ConflictException when updating to duplicate slug', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(
        mockOrganization,
      );
      mockPrismaService.organization.findFirst.mockResolvedValue({
        id: 'org-other',
        slug: 'taken-slug',
      });

      await expect(
        service.update('org-1', { slug: 'taken-slug' }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.update('org-1', { slug: 'taken-slug' }),
      ).rejects.toThrow('Slug is al in gebruik');
    });
  });

  // B-507 / WP-B4 — de bedrading tussen de magic-byte-check en de opslag.
  describe('uploadLogo() / downloadLogo()', () => {
    const pngBuffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
    ]);
    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');

    beforeEach(() => {
      mockPrismaService.organization.findUnique.mockResolvedValue(mockOrganization);
      mockPrismaService.organization.update.mockResolvedValue(mockOrganization);
    });

    it('leidt sleutel én opgeslagen mimetype af uit de bytes, niet uit de bestandsnaam', async () => {
      const key = await service.uploadLogo('org-1', {
        buffer: pngBuffer,
        mimetype: 'image/png',
        originalname: 'evil.svg',
      } as Express.Multer.File);

      expect(key).toMatch(/^logos\/org-1\/.+\.png$/);
      expect(key).not.toContain('svg');
      expect(mockStorage.upload).toHaveBeenCalledWith(key, pngBuffer, 'image/png');
    });

    it('weigert inhoud die geen PNG/JPEG/WebP is en raakt de opslag niet aan', async () => {
      await expect(
        service.uploadLogo('org-1', {
          buffer: svgBuffer,
          mimetype: 'image/png',
          originalname: 'evil.svg',
        } as Express.Multer.File),
      ).rejects.toThrow(/geen geldige PNG-, JPEG- of WebP-afbeelding/);

      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('serveert een legacy .svg-sleutel als octet-stream, nooit als image/svg+xml', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue({
        ...mockOrganization,
        logoUrl: 'logos/org-1/legacy.svg',
      });
      mockStorage.download.mockResolvedValue(svgBuffer);

      const result = await service.downloadLogo('org-1');

      expect(result.mimeType).toBe('application/octet-stream');
      expect(result.disposition).toBe('attachment');
      expect(result.storageKey).toBe('logos/org-1/legacy.svg');
    });
  });
});

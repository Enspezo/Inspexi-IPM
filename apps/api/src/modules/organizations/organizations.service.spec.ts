import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '@/prisma';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: PrismaService;

  const mockOrganization = {
    id: 'org-1',
    name: 'Test Org',
    slug: 'test-org',
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

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: mockPrismaService },
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
});

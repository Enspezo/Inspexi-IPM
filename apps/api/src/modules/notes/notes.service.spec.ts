import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Role, NoteEntityType } from '@prisma/client';
import { NotesService } from './notes.service';
import { PrismaService } from '@/prisma';

describe('NotesService', () => {
  let service: NotesService;

  const mockPrismaService = {
    note: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    contact: { findMany: jest.fn(), findUnique: jest.fn() },
    request: { findMany: jest.fn(), findUnique: jest.fn() },
    quote: { findMany: jest.fn(), findUnique: jest.fn() },
    planningItem: { findMany: jest.fn(), findUnique: jest.fn() },
    project: { findMany: jest.fn(), findUnique: jest.fn() },
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    workOrder: { findMany: jest.fn(), findUnique: jest.fn() },
  };

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.nl',
    roles: [Role.ORG_ADMIN],
  } as any;

  const mockSuperuser = {
    id: 'super-1',
    orgId: null,
    email: 'superuser@inspexi.nl',
    roles: [Role.SUPERUSER],
  } as any;

  const mockRegularUser = {
    id: 'user-3',
    orgId: 'org-1',
    email: 'worker@test.nl',
    roles: [Role.WERKVOORBEREIDER],
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<NotesService>(NotesService);

    // Default enrichment mocks — return empty to avoid errors in enrichWithEntityNames
    mockPrismaService.contact.findMany.mockResolvedValue([]);
    mockPrismaService.request.findMany.mockResolvedValue([]);
    mockPrismaService.quote.findMany.mockResolvedValue([]);
    mockPrismaService.planningItem.findMany.mockResolvedValue([]);
    mockPrismaService.project.findMany.mockResolvedValue([]);
    mockPrismaService.user.findMany.mockResolvedValue([]);
    mockPrismaService.workOrder.findMany.mockResolvedValue([]);

    // FK entity guards (create) resolve to same-org entities for the happy path
    mockPrismaService.contact.findUnique.mockResolvedValue({ orgId: 'org-1' });
    mockPrismaService.request.findUnique.mockResolvedValue({ orgId: 'org-1' });
    mockPrismaService.quote.findUnique.mockResolvedValue({ orgId: 'org-1' });
    mockPrismaService.planningItem.findUnique.mockResolvedValue({ orgId: 'org-1' });
    mockPrismaService.project.findUnique.mockResolvedValue({ orgId: 'org-1' });
    mockPrismaService.user.findUnique.mockResolvedValue({ orgId: 'org-1' });
    mockPrismaService.workOrder.findUnique.mockResolvedValue({ orgId: 'org-1' });
  });

  // ─── findByEntity ──────────────────────────────────────────

  describe('findByEntity', () => {
    it('should return threaded notes for the given entity', async () => {
      const mockNotes = [
        {
          id: 'note-1',
          entityType: NoteEntityType.CONTACT,
          entityId: 'contact-1',
          orgId: 'org-1',
          content: 'Top-level note',
          parentId: null,
          isDeleted: false,
          createdBy: { id: 'user-1', firstName: 'Jan', lastName: 'Jansen' },
          replies: [],
        },
      ];
      mockPrismaService.note.findMany.mockResolvedValue(mockNotes);

      const result = await service.findByEntity(
        NoteEntityType.CONTACT,
        'contact-1',
        mockUser,
      );

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Top-level note');
      expect(mockPrismaService.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityType: NoteEntityType.CONTACT,
            entityId: 'contact-1',
            parentId: null,
            isDeleted: false,
            orgId: 'org-1',
          }),
        }),
      );
    });

    it('should skip orgId filter for SUPERUSER', async () => {
      mockPrismaService.note.findMany.mockResolvedValue([]);

      await service.findByEntity(NoteEntityType.REQUEST, 'req-1', mockSuperuser);

      const call = mockPrismaService.note.findMany.mock.calls[0][0];
      expect(call.where.orgId).toBeUndefined();
    });
  });

  // ─── findAll ───────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated notes for org user', async () => {
      const mockNotes = [
        {
          id: 'note-1',
          entityType: NoteEntityType.CONTACT,
          entityId: 'contact-1',
          orgId: 'org-1',
          content: 'A note',
          _count: { replies: 0 },
          createdBy: { id: 'user-1', firstName: 'Jan', lastName: 'Jansen' },
        },
      ];
      mockPrismaService.note.findMany.mockResolvedValue(mockNotes);
      mockPrismaService.note.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, { page: 1, limit: 20 } as any);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mockPrismaService.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1' }),
        }),
      );
    });

    it('should skip orgId filter for SUPERUSER', async () => {
      mockPrismaService.note.findMany.mockResolvedValue([]);
      mockPrismaService.note.count.mockResolvedValue(0);

      await service.findAll(mockSuperuser, { page: 1, limit: 20 } as any);

      const call = mockPrismaService.note.findMany.mock.calls[0][0];
      expect(call.where.orgId).toBeUndefined();
    });

    it('should filter by entityType', async () => {
      mockPrismaService.note.findMany.mockResolvedValue([]);
      mockPrismaService.note.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        entityType: NoteEntityType.REQUEST,
        page: 1,
        limit: 20,
      } as any);

      expect(mockPrismaService.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityType: NoteEntityType.REQUEST }),
        }),
      );
    });

    it('should filter by search term', async () => {
      mockPrismaService.note.findMany.mockResolvedValue([]);
      mockPrismaService.note.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        search: 'factuur',
        page: 1,
        limit: 20,
      } as any);

      expect(mockPrismaService.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            content: { contains: 'factuur', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should enrich notes with contact entity names', async () => {
      const mockNotes = [
        {
          id: 'note-1',
          entityType: NoteEntityType.CONTACT,
          entityId: 'contact-1',
          orgId: 'org-1',
          _count: { replies: 2 },
          createdBy: { id: 'user-1', firstName: 'Jan', lastName: 'Jansen' },
        },
      ];
      mockPrismaService.note.findMany.mockResolvedValue(mockNotes);
      mockPrismaService.note.count.mockResolvedValue(1);
      mockPrismaService.contact.findMany.mockResolvedValue([
        { id: 'contact-1', companyName: 'ACME BV', firstName: null, lastName: null },
      ]);

      const result = await service.findAll(mockUser, { page: 1, limit: 20 } as any);

      expect(result.data[0].entityName).toBe('ACME BV');
      expect(result.data[0].replyCount).toBe(2);
    });

    it('should enrich notes with request entity names', async () => {
      const mockNotes = [
        {
          id: 'note-2',
          entityType: NoteEntityType.REQUEST,
          entityId: 'req-1',
          orgId: 'org-1',
          _count: { replies: 0 },
          createdBy: { id: 'user-1', firstName: 'Jan', lastName: 'Jansen' },
        },
      ];
      mockPrismaService.note.findMany.mockResolvedValue(mockNotes);
      mockPrismaService.note.count.mockResolvedValue(1);
      mockPrismaService.request.findMany.mockResolvedValue([
        { id: 'req-1', title: 'Aanvraag dak inspectie' },
      ]);

      const result = await service.findAll(mockUser, { page: 1, limit: 20 } as any);

      expect(result.data[0].entityName).toBe('Aanvraag dak inspectie');
    });

    it('should apply valid sortBy field', async () => {
      mockPrismaService.note.findMany.mockResolvedValue([]);
      mockPrismaService.note.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        sortBy: 'entityType',
        sortOrder: 'asc',
        page: 1,
        limit: 20,
      } as any);

      expect(mockPrismaService.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { entityType: 'asc' },
        }),
      );
    });

    it('should fall back to createdAt desc for invalid sortBy', async () => {
      mockPrismaService.note.findMany.mockResolvedValue([]);
      mockPrismaService.note.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        sortBy: 'invalidField',
        sortOrder: 'asc',
        page: 1,
        limit: 20,
      } as any);

      expect(mockPrismaService.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  // ─── findOne ───────────────────────────────────────────────

  describe('findOne', () => {
    it('should return a note by id', async () => {
      const mockNote = {
        id: 'note-1',
        orgId: 'org-1',
        content: 'Test note',
        isDeleted: false,
        createdBy: { id: 'user-1', firstName: 'Jan', lastName: 'Jansen' },
      };
      mockPrismaService.note.findFirst.mockResolvedValue(mockNote);

      const result = await service.findOne('note-1', mockUser);

      expect(result.id).toBe('note-1');
      expect(result.content).toBe('Test note');
    });

    it('should throw NotFoundException when note does not exist', async () => {
      mockPrismaService.note.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when note is soft-deleted (scoped query)', async () => {
      // De where-clause filtert isDeleted weg — de scoped query levert null.
      mockPrismaService.note.findFirst.mockResolvedValue(null);

      await expect(service.findOne('note-1', mockUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.note.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isDeleted: false }),
        }),
      );
    });

    it('should throw the same NotFoundException for cross-org access (B-105: geen oracle)', async () => {
      // Org-scoped query: een vreemde-org-id levert null, identiek aan een
      // niet-bestaand id — cross-org "bestaat niet".
      mockPrismaService.note.findFirst.mockResolvedValue(null);

      await expect(service.findOne('note-1', mockUser)).rejects.toThrow(
        'Notitie niet gevonden',
      );
      expect(mockPrismaService.note.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1' }),
        }),
      );
    });

    it('should allow SUPERUSER cross-org access', async () => {
      const mockNote = {
        id: 'note-1',
        orgId: 'other-org',
        content: 'Cross-org note',
        isDeleted: false,
        createdBy: { id: 'user-2', firstName: 'Piet', lastName: 'Pietersen' },
      };
      mockPrismaService.note.findFirst.mockResolvedValue(mockNote);

      const result = await service.findOne('note-1', mockSuperuser);

      expect(result.id).toBe('note-1');
    });
  });

  // ─── create ────────────────────────────────────────────────

  describe('create', () => {
    it('should create a root note successfully', async () => {
      const mockNote = {
        id: 'note-new',
        entityType: NoteEntityType.CONTACT,
        entityId: 'contact-1',
        content: 'Besprak factuur',
        orgId: 'org-1',
        createdById: 'user-1',
        parentId: null,
        isDeleted: false,
        createdBy: { id: 'user-1', firstName: 'Jan', lastName: 'Jansen' },
      };
      mockPrismaService.note.create.mockResolvedValue(mockNote);

      const result = await service.create(
        {
          entityType: NoteEntityType.CONTACT,
          entityId: 'contact-1',
          content: 'Besprak factuur',
        } as any,
        mockUser,
      );

      expect(result.id).toBe('note-new');
      expect(mockPrismaService.note.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            createdById: 'user-1',
            content: 'Besprak factuur',
          }),
        }),
      );
    });

    it('should create a reply note when parentId is provided', async () => {
      const mockParent = {
        id: 'note-parent',
        parentId: null,
        orgId: 'org-1',
        isDeleted: false,
      };
      mockPrismaService.note.findFirst.mockResolvedValue(mockParent);

      const mockReply = {
        id: 'note-reply',
        entityType: NoteEntityType.CONTACT,
        entityId: 'contact-1',
        content: 'Reply content',
        orgId: 'org-1',
        createdById: 'user-1',
        parentId: 'note-parent',
        isDeleted: false,
        createdBy: { id: 'user-1', firstName: 'Jan', lastName: 'Jansen' },
      };
      mockPrismaService.note.create.mockResolvedValue(mockReply);

      const result = await service.create(
        {
          entityType: NoteEntityType.CONTACT,
          entityId: 'contact-1',
          content: 'Reply content',
          parentId: 'note-parent',
        } as any,
        mockUser,
      );

      expect(result.id).toBe('note-reply');
      expect(result.parentId).toBe('note-parent');
    });

    it('should throw NotFoundException when parent note does not exist', async () => {
      mockPrismaService.note.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          {
            entityType: NoteEntityType.CONTACT,
            entityId: 'contact-1',
            content: 'Reply',
            parentId: 'nonexistent-parent',
          } as any,
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when parent note is soft-deleted (scoped query)', async () => {
      // De where-clause filtert isDeleted weg — de scoped query levert null.
      mockPrismaService.note.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          {
            entityType: NoteEntityType.CONTACT,
            entityId: 'contact-1',
            content: 'Reply',
            parentId: 'note-parent',
          } as any,
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw the same NotFoundException when replying to cross-org parent (B-105)', async () => {
      // Org-scoped query: een vreemde-org-parent levert null → zelfde 404 als
      // een niet-bestaande parent.
      mockPrismaService.note.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          {
            entityType: NoteEntityType.CONTACT,
            entityId: 'contact-1',
            content: 'Reply',
            parentId: 'note-parent',
          } as any,
          mockUser,
        ),
      ).rejects.toThrow('Parent notitie niet gevonden');
      expect(mockPrismaService.note.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1', isDeleted: false }),
        }),
      );
    });

    it('should throw BadRequestException when replying to a reply (depth > 1)', async () => {
      mockPrismaService.note.findFirst.mockResolvedValue({
        id: 'note-reply',
        parentId: 'note-root',
        orgId: 'org-1',
        isDeleted: false,
      });

      await expect(
        service.create(
          {
            entityType: NoteEntityType.CONTACT,
            entityId: 'contact-1',
            content: 'Nested reply',
            parentId: 'note-reply',
          } as any,
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── update ────────────────────────────────────────────────

  describe('update', () => {
    it('should update a note when user is the creator', async () => {
      const existing = {
        id: 'note-1',
        orgId: 'org-1',
        createdById: 'user-1',
        isDeleted: false,
      };
      mockPrismaService.note.findFirst.mockResolvedValue(existing);

      const updated = {
        ...existing,
        content: 'Updated content',
        createdBy: { id: 'user-1', firstName: 'Jan', lastName: 'Jansen' },
      };
      mockPrismaService.note.update.mockResolvedValue(updated);

      const result = await service.update('note-1', { content: 'Updated content' } as any, mockUser);

      expect(result.content).toBe('Updated content');
      expect(mockPrismaService.note.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'note-1' },
          data: { content: 'Updated content' },
        }),
      );
    });

    it('should allow ORG_ADMIN to update any note in their org', async () => {
      const existing = {
        id: 'note-1',
        orgId: 'org-1',
        createdById: 'other-user',
        isDeleted: false,
      };
      mockPrismaService.note.findFirst.mockResolvedValue(existing);
      mockPrismaService.note.update.mockResolvedValue({
        ...existing,
        content: 'Admin edited',
        createdBy: { id: 'other-user', firstName: 'Piet', lastName: 'Pietersen' },
      });

      const result = await service.update(
        'note-1',
        { content: 'Admin edited' } as any,
        mockUser, // ORG_ADMIN
      );

      expect(result.content).toBe('Admin edited');
    });

    it('should throw ForbiddenException when non-owner, non-admin tries to update', async () => {
      mockPrismaService.note.findFirst.mockResolvedValue({
        id: 'note-1',
        orgId: 'org-1',
        createdById: 'other-user',
        isDeleted: false,
      });

      await expect(
        service.update('note-1', { content: 'Hack' } as any, mockRegularUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when note does not exist', async () => {
      mockPrismaService.note.findFirst.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { content: 'Update' } as any, mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when note is soft-deleted (scoped query)', async () => {
      mockPrismaService.note.findFirst.mockResolvedValue(null);

      await expect(
        service.update('note-1', { content: 'Update' } as any, mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw the same NotFoundException for cross-org update (B-105)', async () => {
      mockPrismaService.note.findFirst.mockResolvedValue(null);

      await expect(
        service.update('note-1', { content: 'Update' } as any, mockUser),
      ).rejects.toThrow('Notitie niet gevonden');
      expect(mockPrismaService.note.update).not.toHaveBeenCalled();
    });
  });

  // ─── remove ────────────────────────────────────────────────

  describe('remove', () => {
    it('should soft-delete a note when user is the creator', async () => {
      mockPrismaService.note.findFirst.mockResolvedValue({
        id: 'note-1',
        orgId: 'org-1',
        createdById: 'user-1',
        isDeleted: false,
      });
      mockPrismaService.note.update.mockResolvedValue({});

      await service.remove('note-1', mockUser);

      expect(mockPrismaService.note.update).toHaveBeenCalledWith({
        where: { id: 'note-1' },
        data: { isDeleted: true },
      });
    });

    it('should allow ORG_ADMIN to delete any note in their org', async () => {
      mockPrismaService.note.findFirst.mockResolvedValue({
        id: 'note-1',
        orgId: 'org-1',
        createdById: 'other-user',
        isDeleted: false,
      });
      mockPrismaService.note.update.mockResolvedValue({});

      await service.remove('note-1', mockUser);

      expect(mockPrismaService.note.update).toHaveBeenCalledWith({
        where: { id: 'note-1' },
        data: { isDeleted: true },
      });
    });

    it('should throw NotFoundException when note does not exist', async () => {
      mockPrismaService.note.findFirst.mockResolvedValue(null);

      await expect(service.remove('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when note is soft-deleted (scoped query)', async () => {
      mockPrismaService.note.findFirst.mockResolvedValue(null);

      await expect(service.remove('note-1', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw the same NotFoundException for cross-org delete (B-105)', async () => {
      mockPrismaService.note.findFirst.mockResolvedValue(null);

      await expect(service.remove('note-1', mockUser)).rejects.toThrow(
        'Notitie niet gevonden',
      );
      expect(mockPrismaService.note.update).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when non-owner, non-admin tries to delete', async () => {
      mockPrismaService.note.findFirst.mockResolvedValue({
        id: 'note-1',
        orgId: 'org-1',
        createdById: 'other-user',
        isDeleted: false,
      });

      await expect(service.remove('note-1', mockRegularUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow SUPERUSER to delete any note cross-org', async () => {
      mockPrismaService.note.findFirst.mockResolvedValue({
        id: 'note-1',
        orgId: 'other-org',
        createdById: 'other-user',
        isDeleted: false,
      });
      mockPrismaService.note.update.mockResolvedValue({});

      await service.remove('note-1', mockSuperuser);

      expect(mockPrismaService.note.update).toHaveBeenCalledWith({
        where: { id: 'note-1' },
        data: { isDeleted: true },
      });
    });
  });
});

import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Role, Prisma, DocumentEntityType, NotificationType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '@/common/services/storage/storage.interface';
import { paginate, buildOrderBy, orgScope, assertSameOrg, assertAllSameOrg } from '@/common';
import { UploadDocumentDto, ListDocumentsQueryDto, UpdateDocumentDto } from './dto';

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
};

/**
 * Shared include for document reads: uploader + non-deleted tags (ordered).
 * A soft-deleted tag is filtered out here so it disappears from documents
 * without touching the document itself.
 */
const documentInclude = {
  uploadedBy: { select: userSelect },
  tags: {
    where: { documentTag: { isDeleted: false } },
    include: { documentTag: { select: { id: true, name: true, color: true } } },
    orderBy: { documentTag: { sortOrder: 'asc' } },
  },
} satisfies Prisma.DocumentInclude;

type DocumentWithRelations = Prisma.DocumentGetPayload<{
  include: typeof documentInclude;
}>;

/** Flatten the tag-assignment join rows into a plain `{ id, name, color }[]`. */
function flattenTags(doc: DocumentWithRelations) {
  const { tags, ...rest } = doc;
  return { ...rest, tags: (tags ?? []).map((t) => t.documentTag) };
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
  ) {}

  /**
   * Resolve entity display names for a list of documents.
   * Batches lookups per entity type for efficiency.
   */
  private async enrichWithEntityNames(
    docs: Array<{ entityType: DocumentEntityType; entityId: string }>,
  ): Promise<Map<string, string>> {
    const nameMap = new Map<string, string>();

    const contactIds = docs
      .filter((d) => d.entityType === DocumentEntityType.CONTACT)
      .map((d) => d.entityId);
    const requestIds = docs
      .filter((d) => d.entityType === DocumentEntityType.REQUEST)
      .map((d) => d.entityId);
    const quoteIds = docs
      .filter((d) => d.entityType === DocumentEntityType.QUOTE)
      .map((d) => d.entityId);
    const productIds = docs
      .filter((d) => d.entityType === DocumentEntityType.PRODUCT)
      .map((d) => d.entityId);
    const taskIds = docs
      .filter((d) => d.entityType === DocumentEntityType.TASK)
      .map((d) => d.entityId);

    if (contactIds.length > 0) {
      const contacts = await this.prisma.contact.findMany({
        where: { id: { in: contactIds } },
        select: { id: true, companyName: true, firstName: true, lastName: true },
      });
      for (const c of contacts) {
        const name =
          c.companyName ||
          [c.firstName, c.lastName].filter(Boolean).join(' ') ||
          '—';
        nameMap.set(c.id, name);
      }
    }

    const locationIds = docs
      .filter((d) => d.entityType === DocumentEntityType.LOCATION)
      .map((d) => d.entityId);

    if (locationIds.length > 0) {
      const locations = await this.prisma.location.findMany({
        where: { id: { in: locationIds } },
        select: { id: true, name: true },
      });
      for (const l of locations) {
        nameMap.set(l.id, l.name);
      }
    }

    if (requestIds.length > 0) {
      const requests = await this.prisma.request.findMany({
        where: { id: { in: requestIds } },
        select: { id: true, title: true },
      });
      for (const r of requests) {
        nameMap.set(r.id, r.title);
      }
    }

    if (quoteIds.length > 0) {
      const quotes = await this.prisma.quote.findMany({
        where: { id: { in: quoteIds } },
        select: { id: true, quoteNumber: true },
      });
      for (const q of quotes) {
        nameMap.set(q.id, q.quoteNumber);
      }
    }

    if (productIds.length > 0) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
      });
      for (const p of products) {
        nameMap.set(p.id, p.name);
      }
    }

    if (taskIds.length > 0) {
      const tasks = await this.prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, title: true },
      });
      for (const t of tasks) {
        nameMap.set(t.id, t.title);
      }
    }

    const planningIds = docs
      .filter((d) => d.entityType === DocumentEntityType.PLANNING)
      .map((d) => d.entityId);

    if (planningIds.length > 0) {
      const items = await this.prisma.planningItem.findMany({
        where: { id: { in: planningIds } },
        select: { id: true, productName: true },
      });
      for (const item of items) {
        nameMap.set(item.id, item.productName);
      }
    }

    const projectIds = docs
      .filter((d) => d.entityType === DocumentEntityType.PROJECT)
      .map((d) => d.entityId);

    if (projectIds.length > 0) {
      const projects = await this.prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, title: true, projectNumber: true },
      });
      for (const p of projects) {
        nameMap.set(p.id, `${p.projectNumber} — ${p.title}`);
      }
    }

    const userIds = docs
      .filter((d) => d.entityType === DocumentEntityType.USER)
      .map((d) => d.entityId);

    if (userIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const u of users) {
        nameMap.set(u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || '—');
      }
    }

    const workOrderIds = docs
      .filter((d) => d.entityType === DocumentEntityType.WORK_ORDER)
      .map((d) => d.entityId);

    if (workOrderIds.length > 0) {
      const workOrders = await this.prisma.workOrder.findMany({
        where: { id: { in: workOrderIds } },
        select: { id: true, workOrderNumber: true },
      });
      for (const wo of workOrders) {
        nameMap.set(wo.id, wo.workOrderNumber);
      }
    }

    const supportTicketIds = docs
      .filter((d) => d.entityType === DocumentEntityType.SUPPORT_TICKET)
      .map((d) => d.entityId);

    if (supportTicketIds.length > 0) {
      const tickets = await this.prisma.supportTicket.findMany({
        where: { id: { in: supportTicketIds } },
        select: { id: true, ticketNumber: true, subject: true },
      });
      for (const t of tickets) {
        nameMap.set(t.id, `#${t.ticketNumber} ${t.subject}`);
      }
    }

    return nameMap;
  }

  /**
   * Map a document entity type to its org-scoped Prisma delegate + NL label.
   * Every linkable entity owns an `orgId`, so a single helper keeps the
   * cross-tenant upload check uniform across all types.
   */
  private entityRef(entityType: DocumentEntityType): {
    model: Parameters<typeof assertSameOrg>[0];
    label: string;
  } {
    switch (entityType) {
      case DocumentEntityType.CONTACT:
        return { model: this.prisma.contact, label: 'Relatie' };
      case DocumentEntityType.LOCATION:
        return { model: this.prisma.location, label: 'Locatie' };
      case DocumentEntityType.REQUEST:
        return { model: this.prisma.request, label: 'Aanvraag' };
      case DocumentEntityType.QUOTE:
        return { model: this.prisma.quote, label: 'Offerte' };
      case DocumentEntityType.PRODUCT:
        return { model: this.prisma.product, label: 'Product' };
      case DocumentEntityType.TASK:
        return { model: this.prisma.task, label: 'Taak' };
      case DocumentEntityType.PLANNING:
        return { model: this.prisma.planningItem, label: 'Afspraak' };
      case DocumentEntityType.PROJECT:
        return { model: this.prisma.project, label: 'Project' };
      case DocumentEntityType.WORK_ORDER:
        return { model: this.prisma.workOrder, label: 'Werkbon' };
      case DocumentEntityType.USER:
        return { model: this.prisma.user, label: 'Gebruiker' };
      case DocumentEntityType.SUPPORT_TICKET:
        return { model: this.prisma.supportTicket, label: 'Supportticket' };
      default: {
        // Exhaustiveness guard: adding a DocumentEntityType without handling it
        // here becomes a compile-time error instead of a runtime surprise.
        const _exhaustive: never = entityType;
        return _exhaustive;
      }
    }
  }

  async upload(file: Express.Multer.File, dto: UploadDocumentDto, user: User) {
    const orgId = user.orgId!;

    // Validate the linked entity exists and belongs to the caller's org
    // (prevents linking a document to another tenant's record by UUID).
    const { model, label } = this.entityRef(dto.entityType);
    await assertSameOrg(model, dto.entityId, user.orgId, label);

    // Validate any requested tags belong to the same org before writing.
    const tagIds = await this.resolveTagIds(dto.tagIds, orgId);

    const storageKey = `${orgId}/${randomUUID()}-${file.originalname}`;

    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    const created = await this.prisma.document.create({
      data: {
        orgId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        fileName: file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storageKey,
        description: dto.description || null,
        uploadedById: user.id,
        ...(tagIds.length
          ? {
              tags: {
                create: tagIds.map((documentTagId) => ({
                  documentTagId,
                  orgId,
                })),
              },
            }
          : {}),
      },
      include: documentInclude,
    });

    const document = flattenTags(created);

    // Dispatch notification
    this.dispatchUploadNotification(document, user);

    // Enrich with entity name
    const nameMap = await this.enrichWithEntityNames([document]);
    return {
      ...document,
      entityName: nameMap.get(document.entityId) || null,
    };
  }

  async findAll(user: User, query: ListDocumentsQueryDto) {
    const { search, entityType, entityId, onlyMine, tagId, page = 1, limit = 20, sortBy, sortOrder = 'desc' } = query;
    const ALLOWED_SORT_FIELDS = ['originalName', 'mimeType', 'size', 'entityType', 'createdAt'];
    const orderBy = buildOrderBy(sortBy, sortOrder, ALLOWED_SORT_FIELDS, { createdAt: 'desc' });

    const where: Prisma.DocumentWhereInput = { ...orgScope(user), isDeleted: false };

    if (onlyMine === 'true') {
      where.uploadedById = user.id;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (entityId) {
      where.entityId = entityId;
    }

    if (tagId) {
      // Only match documents that carry this (non-deleted) tag.
      where.tags = { some: { documentTagId: tagId, documentTag: { isDeleted: false } } };
    }

    if (search) {
      where.originalName = { contains: search, mode: 'insensitive' };
    }

    const result = await paginate(this.prisma.document, {
      where,
      include: documentInclude,
      orderBy,
      page,
      limit,
    });

    // paginate infers the bare delegate type; the include is applied at runtime.
    const shaped = (result.data as DocumentWithRelations[]).map(flattenTags);

    // Enrich with entity names
    const nameMap = await this.enrichWithEntityNames(shaped);
    const enrichedData = shaped.map((doc) => ({
      ...doc,
      entityName: nameMap.get(doc.entityId) || null,
    }));

    return { ...result, data: enrichedData };
  }

  async findOne(id: string, user: User) {
    const found = await this.prisma.document.findUnique({
      where: { id },
      include: documentInclude,
    });

    if (!found || found.isDeleted) {
      throw new NotFoundException('Document niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && found.orgId !== user.orgId) {
      throw new ForbiddenException('Geen toegang tot dit document');
    }

    const document = flattenTags(found);
    const nameMap = await this.enrichWithEntityNames([document]);
    return {
      ...document,
      entityName: nameMap.get(document.entityId) || null,
    };
  }

  async download(id: string, user: User) {
    const document = await this.prisma.document.findUnique({
      where: { id },
    });

    if (!document || document.isDeleted) {
      throw new NotFoundException('Document niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && document.orgId !== user.orgId) {
      throw new ForbiddenException('Geen toegang tot dit document');
    }

    const buffer = await this.storage.download(document.storageKey);
    return { buffer, document };
  }

  async update(id: string, dto: UpdateDocumentDto, user: User) {
    const existing = await this.prisma.document.findUnique({
      where: { id },
    });

    if (!existing || existing.isDeleted) {
      throw new NotFoundException('Document niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && existing.orgId !== user.orgId) {
      throw new ForbiddenException('Geen toegang tot dit document');
    }

    // Replace the full tag-set when tagIds is provided (validated same-org).
    if (dto.tagIds !== undefined) {
      const tagIds = await this.resolveTagIds(dto.tagIds, existing.orgId);
      await this.prisma.$transaction([
        this.prisma.documentTagAssignment.deleteMany({ where: { documentId: id } }),
        ...(tagIds.length
          ? [
              this.prisma.documentTagAssignment.createMany({
                data: tagIds.map((documentTagId) => ({
                  documentId: id,
                  documentTagId,
                  orgId: existing.orgId,
                })),
                skipDuplicates: true,
              }),
            ]
          : []),
      ]);
    }

    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        description: dto.description ?? existing.description,
        ...(dto.isSharedWithClient !== undefined ? { isSharedWithClient: dto.isSharedWithClient } : {}),
      },
      include: documentInclude,
    });

    const document = flattenTags(updated);
    const nameMap = await this.enrichWithEntityNames([document]);
    return {
      ...document,
      entityName: nameMap.get(document.entityId) || null,
    };
  }

  /**
   * Validate a set of tag-IDs for assignment to a document: every id must
   * belong to `orgId` (cross-tenant guard) and must not be soft-deleted.
   * Returns the de-duplicated list. Empty/undefined → empty list.
   */
  private async resolveTagIds(
    tagIds: string[] | undefined,
    orgId: string,
  ): Promise<string[]> {
    if (!tagIds || tagIds.length === 0) return [];
    const unique = [...new Set(tagIds)];

    // Cross-tenant isolation: reject ids from other orgs (403).
    await assertAllSameOrg(this.prisma.documentTag, unique, orgId, 'tags');

    // Reject soft-deleted tags (would otherwise create dangling assignments).
    const active = await this.prisma.documentTag.findMany({
      where: { id: { in: unique }, orgId, isDeleted: false },
      select: { id: true },
    });
    if (active.length !== unique.length) {
      throw new NotFoundException('Een of meer tags zijn niet gevonden');
    }

    return unique;
  }

  async getStorageStats(orgId: string) {
    // Total usage and count
    const totals = await this.prisma.document.aggregate({
      where: { orgId, isDeleted: false },
      _sum: { size: true },
      _count: true,
    });

    // Breakdown by entity type
    const byEntityType = await this.prisma.document.groupBy({
      by: ['entityType'],
      where: { orgId, isDeleted: false },
      _sum: { size: true },
      _count: true,
    });

    // Breakdown by user
    const byUser = await this.prisma.document.groupBy({
      by: ['uploadedById'],
      where: { orgId, isDeleted: false },
      _sum: { size: true },
      _count: true,
    });

    // Resolve user names
    const userIds = byUser.map((u) => u.uploadedById);
    const users = userIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      quotaBytes: 100 * 1024 * 1024, // 100 MB default
      totalBytes: totals._sum.size ?? 0,
      totalFiles: totals._count,
      byEntityType: byEntityType.map((row) => ({
        entityType: row.entityType,
        totalBytes: row._sum.size ?? 0,
        fileCount: row._count,
      })),
      byUser: byUser.map((row) => {
        const u = userMap.get(row.uploadedById);
        return {
          userId: row.uploadedById,
          userName: u
            ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
            : 'Onbekend',
          userEmail: u?.email ?? '',
          totalBytes: row._sum.size ?? 0,
          fileCount: row._count,
        };
      }),
    };
  }

  async remove(id: string, user: User) {
    const existing = await this.prisma.document.findUnique({
      where: { id },
    });

    if (!existing || existing.isDeleted) {
      throw new NotFoundException('Document niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && existing.orgId !== user.orgId) {
      throw new ForbiddenException('Geen toegang tot dit document');
    }

    await this.prisma.document.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  private dispatchUploadNotification(
    document: { id: string; orgId: string; entityType: DocumentEntityType; entityId: string; originalName: string; uploadedById: string },
    user: User,
  ) {
    // Find relevant users to notify based on entity type
    this.resolveNotificationRecipients(document, user)
      .then((recipientIds) => {
        if (recipientIds.length > 0) {
          this.notifications.dispatch({
            type: NotificationType.DOCUMENT_GEUPLOAD,
            orgId: document.orgId,
            recipientUserIds: recipientIds,
            title: 'Document geüpload',
            body: `Document "${document.originalName}" is toegevoegd.`,
            entityType: 'document',
            entityId: document.id,
          });
        }
      })
      .catch(() => {
        // Silently fail notification dispatch
      });
  }

  private async resolveNotificationRecipients(
    document: { entityType: DocumentEntityType; entityId: string; uploadedById: string },
    user: User,
  ): Promise<string[]> {
    const recipientIds = new Set<string>();

    switch (document.entityType) {
      case DocumentEntityType.CONTACT: {
        const contact = await this.prisma.contact.findUnique({
          where: { id: document.entityId },
          select: { ownerId: true },
        });
        if (contact?.ownerId) recipientIds.add(contact.ownerId);
        break;
      }
      case DocumentEntityType.REQUEST: {
        const request = await this.prisma.request.findUnique({
          where: { id: document.entityId },
          select: { assignedTo: true, createdBy: true },
        });
        if (request?.assignedTo) recipientIds.add(request.assignedTo);
        if (request?.createdBy) recipientIds.add(request.createdBy);
        break;
      }
      case DocumentEntityType.QUOTE: {
        const quote = await this.prisma.quote.findUnique({
          where: { id: document.entityId },
          select: { createdBy: true },
        });
        if (quote?.createdBy) recipientIds.add(quote.createdBy);
        break;
      }
      case DocumentEntityType.TASK: {
        const task = await this.prisma.task.findUnique({
          where: { id: document.entityId },
          select: { assigneeId: true, createdById: true },
        });
        if (task?.assigneeId) recipientIds.add(task.assigneeId);
        if (task?.createdById) recipientIds.add(task.createdById);
        break;
      }
      case DocumentEntityType.PRODUCT:
        // No specific owner for products
        break;
      case DocumentEntityType.LOCATION: {
        // Notify the owner of the contact the location belongs to.
        const location = await this.prisma.location.findUnique({
          where: { id: document.entityId },
          select: { contact: { select: { ownerId: true } } },
        });
        if (location?.contact?.ownerId) recipientIds.add(location.contact.ownerId);
        break;
      }
      case DocumentEntityType.PLANNING: {
        const planningItem = await this.prisma.planningItem.findUnique({
          where: { id: document.entityId },
          select: { createdBy: true },
        });
        if (planningItem?.createdBy) recipientIds.add(planningItem.createdBy);
        break;
      }
      case DocumentEntityType.PROJECT: {
        const project = await this.prisma.project.findUnique({
          where: { id: document.entityId },
          select: { projectManagerId: true, createdBy: true },
        });
        if (project?.projectManagerId) recipientIds.add(project.projectManagerId);
        if (project?.createdBy) recipientIds.add(project.createdBy);
        break;
      }
      case DocumentEntityType.WORK_ORDER: {
        const workOrder = await this.prisma.workOrder.findUnique({
          where: { id: document.entityId },
          select: { createdBy: true },
        });
        if (workOrder?.createdBy) recipientIds.add(workOrder.createdBy);
        break;
      }
      case DocumentEntityType.USER:
        // Notify the user whose profile the document is attached to.
        recipientIds.add(document.entityId);
        break;
    }

    // Remove the uploader from recipients
    recipientIds.delete(user.id);

    return Array.from(recipientIds);
  }
}

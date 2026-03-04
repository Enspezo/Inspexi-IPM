import {
  Injectable,
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
import { UploadDocumentDto, ListDocumentsQueryDto, UpdateDocumentDto } from './dto';

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
};

@Injectable()
export class DocumentsService {
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

    return nameMap;
  }

  async upload(file: Express.Multer.File, dto: UploadDocumentDto, user: User) {
    const orgId = user.orgId!;
    const storageKey = `${orgId}/${randomUUID()}-${file.originalname}`;

    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    const document = await this.prisma.document.create({
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
      },
      include: {
        uploadedBy: { select: userSelect },
      },
    });

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
    const { search, entityType, entityId, onlyMine, page = 1, limit = 20, sortBy, sortOrder = 'desc' } = query;
    const ALLOWED_SORT_FIELDS = ['originalName', 'mimeType', 'size', 'entityType', 'createdAt'];
    const orderBy = (sortBy && ALLOWED_SORT_FIELDS.includes(sortBy))
      ? { [sortBy]: sortOrder }
      : { createdAt: 'desc' as const };
    const skip = (page - 1) * limit;

    const where: Prisma.DocumentWhereInput = { isDeleted: false };

    if (!user.roles.includes(Role.SUPERUSER)) {
      where.orgId = user.orgId!;
    }

    if (onlyMine === 'true') {
      where.uploadedById = user.id;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (entityId) {
      where.entityId = entityId;
    }

    if (search) {
      where.originalName = { contains: search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        include: {
          uploadedBy: { select: userSelect },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.document.count({ where }),
    ]);

    // Enrich with entity names
    const nameMap = await this.enrichWithEntityNames(data);
    const enrichedData = data.map((doc) => ({
      ...doc,
      entityName: nameMap.get(doc.entityId) || null,
    }));

    return { data: enrichedData, total, page, limit };
  }

  async findOne(id: string, user: User) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: userSelect },
      },
    });

    if (!document || document.isDeleted) {
      throw new NotFoundException('Document niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && document.orgId !== user.orgId) {
      throw new ForbiddenException('Geen toegang tot dit document');
    }

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

    const document = await this.prisma.document.update({
      where: { id },
      data: {
        description: dto.description ?? existing.description,
        ...(dto.isSharedWithClient !== undefined ? { isSharedWithClient: dto.isSharedWithClient } : {}),
      },
      include: {
        uploadedBy: { select: userSelect },
      },
    });

    const nameMap = await this.enrichWithEntityNames([document]);
    return {
      ...document,
      entityName: nameMap.get(document.entityId) || null,
    };
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
      case DocumentEntityType.PLANNING: {
        const planningItem = await this.prisma.planningItem.findUnique({
          where: { id: document.entityId },
          select: { createdBy: true },
        });
        if (planningItem?.createdBy) recipientIds.add(planningItem.createdBy);
        break;
      }
    }

    // Remove the uploader from recipients
    recipientIds.delete(user.id);

    return Array.from(recipientIds);
  }
}

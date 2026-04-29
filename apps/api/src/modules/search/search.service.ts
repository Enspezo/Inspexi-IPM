import { Injectable } from '@nestjs/common';
import { User, Role, TaskEntityType, DocumentEntityType } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { SearchQueryDto, SearchEntityType } from './dto/search-query.dto';

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
};

export interface SearchGroup {
  type: SearchEntityType;
  total: number;
  items: unknown[];
}

export interface SearchResult {
  groups: SearchGroup[];
}

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(user: User, query: SearchQueryDto): Promise<SearchResult> {
    const { q, type, limit = 4, page = 1 } = query;
    const skip = (page - 1) * limit;
    const orgScope = !user.roles.includes(Role.SUPERUSER) ? { orgId: user.orgId! } : {};
    const canSeeProducts = !user.roles.includes(Role.INSPECTEUR);

    const runAll = !type;

    const [
      contactsResult,
      contactPersonsResult,
      locationsResult,
      requestsResult,
      quotesResult,
      tasksResult,
      documentsResult,
      productsResult,
    ] = await Promise.all([
      runAll || type === SearchEntityType.CONTACT
        ? this.searchContacts(q, orgScope, limit, skip)
        : null,
      runAll || type === SearchEntityType.CONTACT_PERSON
        ? this.searchContactPersons(q, orgScope, limit, skip)
        : null,
      runAll || type === SearchEntityType.LOCATION
        ? this.searchLocations(q, orgScope, limit, skip)
        : null,
      runAll || type === SearchEntityType.REQUEST
        ? this.searchRequests(q, orgScope, limit, skip)
        : null,
      runAll || type === SearchEntityType.QUOTE
        ? this.searchQuotes(q, orgScope, limit, skip)
        : null,
      runAll || type === SearchEntityType.TASK
        ? this.searchTasks(q, orgScope, limit, skip)
        : null,
      runAll || type === SearchEntityType.DOCUMENT
        ? this.searchDocuments(q, orgScope, limit, skip)
        : null,
      canSeeProducts && (runAll || type === SearchEntityType.PRODUCT)
        ? this.searchProducts(q, orgScope, limit, skip)
        : null,
    ]);

    const groups: SearchGroup[] = [];

    if (contactsResult) {
      groups.push({ type: SearchEntityType.CONTACT, ...contactsResult });
    }
    if (contactPersonsResult) {
      groups.push({ type: SearchEntityType.CONTACT_PERSON, ...contactPersonsResult });
    }
    if (locationsResult) {
      groups.push({ type: SearchEntityType.LOCATION, ...locationsResult });
    }
    if (requestsResult) {
      groups.push({ type: SearchEntityType.REQUEST, ...requestsResult });
    }
    if (quotesResult) {
      groups.push({ type: SearchEntityType.QUOTE, ...quotesResult });
    }
    if (tasksResult) {
      groups.push({ type: SearchEntityType.TASK, ...tasksResult });
    }
    if (documentsResult) {
      groups.push({ type: SearchEntityType.DOCUMENT, ...documentsResult });
    }
    if (productsResult) {
      groups.push({ type: SearchEntityType.PRODUCT, ...productsResult });
    }

    return { groups };
  }

  private async searchContacts(
    q: string,
    orgScope: object,
    limit: number,
    skip: number,
  ) {
    const where = {
      isDeleted: false,
      ...orgScope,
      OR: [
        { companyName: { contains: q, mode: 'insensitive' as const } },
        { firstName: { contains: q, mode: 'insensitive' as const } },
        { lastName: { contains: q, mode: 'insensitive' as const } },
        { email: { contains: q, mode: 'insensitive' as const } },
      ],
    };

    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        select: {
          id: true,
          type: true,
          companyName: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          addresses: {
            where: { isPrimary: true },
            select: { city: true },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return { items, total };
  }

  private async searchContactPersons(
    q: string,
    orgScope: object,
    limit: number,
    skip: number,
  ) {
    const where = {
      isDeleted: false,
      ...orgScope,
      OR: [
        { firstName: { contains: q, mode: 'insensitive' as const } },
        { lastName: { contains: q, mode: 'insensitive' as const } },
        { email: { contains: q, mode: 'insensitive' as const } },
      ],
    };

    const [items, total] = await Promise.all([
      this.prisma.contactPerson.findMany({
        where,
        select: {
          id: true,
          contactId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          contact: {
            select: {
              id: true,
              companyName: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.contactPerson.count({ where }),
    ]);

    return { items, total };
  }

  private async searchLocations(
    q: string,
    orgScope: object,
    limit: number,
    skip: number,
  ) {
    const where = {
      ...orgScope,
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { street: { contains: q, mode: 'insensitive' as const } },
        { city: { contains: q, mode: 'insensitive' as const } },
        { postalCode: { contains: q, mode: 'insensitive' as const } },
        { objectType: { contains: q, mode: 'insensitive' as const } },
      ],
    };

    const [items, total] = await Promise.all([
      this.prisma.location.findMany({
        where,
        select: {
          id: true,
          contactId: true,
          name: true,
          street: true,
          houseNumber: true,
          postalCode: true,
          city: true,
          objectType: true,
          contact: {
            select: {
              id: true,
              companyName: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.location.count({ where }),
    ]);

    return { items, total };
  }

  private async searchRequests(
    q: string,
    orgScope: object,
    limit: number,
    skip: number,
  ) {
    const where = {
      isDeleted: false,
      ...orgScope,
      OR: [
        { title: { contains: q, mode: 'insensitive' as const } },
        {
          contact: {
            OR: [
              { companyName: { contains: q, mode: 'insensitive' as const } },
              { firstName: { contains: q, mode: 'insensitive' as const } },
              { lastName: { contains: q, mode: 'insensitive' as const } },
            ],
          },
        },
      ],
    };

    const [items, total] = await Promise.all([
      this.prisma.request.findMany({
        where,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          createdAt: true,
          contact: {
            select: {
              id: true,
              companyName: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.request.count({ where }),
    ]);

    return { items, total };
  }

  private async searchQuotes(
    q: string,
    orgScope: object,
    limit: number,
    skip: number,
  ) {
    const where = {
      ...orgScope,
      OR: [
        { subject: { contains: q, mode: 'insensitive' as const } },
        { quoteNumber: { contains: q, mode: 'insensitive' as const } },
        {
          contact: {
            OR: [
              { companyName: { contains: q, mode: 'insensitive' as const } },
              { firstName: { contains: q, mode: 'insensitive' as const } },
              { lastName: { contains: q, mode: 'insensitive' as const } },
            ],
          },
        },
      ],
    };

    const [items, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        select: {
          id: true,
          quoteNumber: true,
          subject: true,
          status: true,
          total: true,
          createdAt: true,
          contact: {
            select: {
              id: true,
              companyName: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.quote.count({ where }),
    ]);

    return { items, total };
  }

  private async searchTasks(
    q: string,
    orgScope: object,
    limit: number,
    skip: number,
  ) {
    const where = {
      ...orgScope,
      OR: [
        { title: { contains: q, mode: 'insensitive' as const } },
        { description: { contains: q, mode: 'insensitive' as const } },
      ],
    };

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        select: {
          id: true,
          title: true,
          status: true,
          entityType: true,
          entityId: true,
          deadline: true,
          assignee: { select: userSelect },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.task.count({ where }),
    ]);

    const nameMap = await this.resolveTaskEntityNames(items);
    const enrichedItems = items.map((task) => ({
      ...task,
      entityName: nameMap.get(task.entityId) ?? null,
    }));

    return { items: enrichedItems, total };
  }

  private async resolveTaskEntityNames(
    tasks: Array<{ entityType: TaskEntityType; entityId: string }>,
  ): Promise<Map<string, string>> {
    const nameMap = new Map<string, string>();

    const contactIds = tasks
      .filter((t) => t.entityType === TaskEntityType.CONTACT)
      .map((t) => t.entityId);
    const requestIds = tasks
      .filter((t) => t.entityType === TaskEntityType.REQUEST)
      .map((t) => t.entityId);
    const quoteIds = tasks
      .filter((t) => t.entityType === TaskEntityType.QUOTE)
      .map((t) => t.entityId);
    const planningIds = tasks
      .filter((t) => t.entityType === TaskEntityType.PLANNING)
      .map((t) => t.entityId);

    await Promise.all([
      contactIds.length > 0
        ? this.prisma.contact
            .findMany({
              where: { id: { in: contactIds } },
              select: { id: true, companyName: true, firstName: true, lastName: true },
            })
            .then((contacts) => {
              for (const c of contacts) {
                nameMap.set(
                  c.id,
                  c.companyName ||
                    [c.firstName, c.lastName].filter(Boolean).join(' ') ||
                    '—',
                );
              }
            })
        : Promise.resolve(),
      requestIds.length > 0
        ? this.prisma.request
            .findMany({
              where: { id: { in: requestIds } },
              select: { id: true, title: true },
            })
            .then((requests) => {
              for (const r of requests) nameMap.set(r.id, r.title);
            })
        : Promise.resolve(),
      quoteIds.length > 0
        ? this.prisma.quote
            .findMany({
              where: { id: { in: quoteIds } },
              select: { id: true, quoteNumber: true },
            })
            .then((quotes) => {
              for (const q of quotes) nameMap.set(q.id, q.quoteNumber);
            })
        : Promise.resolve(),
      planningIds.length > 0
        ? this.prisma.planningItem
            .findMany({
              where: { id: { in: planningIds } },
              select: { id: true, productName: true },
            })
            .then((items) => {
              for (const item of items) nameMap.set(item.id, item.productName);
            })
        : Promise.resolve(),
    ]);

    return nameMap;
  }

  private async resolveDocumentEntityNames(
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

    await Promise.all([
      contactIds.length > 0
        ? this.prisma.contact
            .findMany({
              where: { id: { in: contactIds } },
              select: { id: true, companyName: true, firstName: true, lastName: true },
            })
            .then((contacts) => {
              for (const c of contacts) {
                nameMap.set(
                  c.id,
                  c.companyName ||
                    [c.firstName, c.lastName].filter(Boolean).join(' ') ||
                    '—',
                );
              }
            })
        : Promise.resolve(),
      requestIds.length > 0
        ? this.prisma.request
            .findMany({
              where: { id: { in: requestIds } },
              select: { id: true, title: true },
            })
            .then((requests) => {
              for (const r of requests) nameMap.set(r.id, r.title);
            })
        : Promise.resolve(),
      quoteIds.length > 0
        ? this.prisma.quote
            .findMany({
              where: { id: { in: quoteIds } },
              select: { id: true, quoteNumber: true },
            })
            .then((quotes) => {
              for (const q of quotes) nameMap.set(q.id, q.quoteNumber);
            })
        : Promise.resolve(),
      productIds.length > 0
        ? this.prisma.product
            .findMany({
              where: { id: { in: productIds } },
              select: { id: true, name: true },
            })
            .then((products) => {
              for (const p of products) nameMap.set(p.id, p.name);
            })
        : Promise.resolve(),
      taskIds.length > 0
        ? this.prisma.task
            .findMany({
              where: { id: { in: taskIds } },
              select: { id: true, title: true },
            })
            .then((tasks) => {
              for (const t of tasks) nameMap.set(t.id, t.title);
            })
        : Promise.resolve(),
    ]);

    return nameMap;
  }

  private async searchDocuments(
    q: string,
    orgScope: object,
    limit: number,
    skip: number,
  ) {
    const where = {
      isDeleted: false,
      ...orgScope,
      OR: [
        { originalName: { contains: q, mode: 'insensitive' as const } },
        { description: { contains: q, mode: 'insensitive' as const } },
      ],
    };

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          entityType: true,
          entityId: true,
          createdAt: true,
          uploadedBy: { select: userSelect },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.document.count({ where }),
    ]);

    const nameMap = await this.resolveDocumentEntityNames(items);
    const enrichedItems = items.map((doc) => ({
      ...doc,
      entityName: nameMap.get(doc.entityId) ?? null,
    }));

    return { items: enrichedItems, total };
  }

  private async searchProducts(
    q: string,
    orgScope: object,
    limit: number,
    skip: number,
  ) {
    const where = {
      ...orgScope,
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { productGroup: { name: { contains: q, mode: 'insensitive' as const } } },
      ],
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          unit: true,
          isActive: true,
          productGroup: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
        take: limit,
        skip,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total };
  }
}

import { ForbiddenException } from '@nestjs/common';
import { Role, User, QuoteStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma';
import { assertFound } from '@/common';

export const VALID_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  [QuoteStatus.CONCEPT]: [QuoteStatus.TER_GOEDKEURING, QuoteStatus.GOEDGEKEURD, QuoteStatus.VERLOPEN],
  [QuoteStatus.TER_GOEDKEURING]: [QuoteStatus.GOEDGEKEURD, QuoteStatus.CONCEPT, QuoteStatus.VERLOPEN],
  [QuoteStatus.GOEDGEKEURD]: [QuoteStatus.VERSTUURD, QuoteStatus.VERLOPEN],
  [QuoteStatus.VERSTUURD]: [QuoteStatus.BEKEKEN, QuoteStatus.VERLOPEN],
  [QuoteStatus.BEKEKEN]: [QuoteStatus.GEACCEPTEERD, QuoteStatus.AFGEWEZEN, QuoteStatus.VERLOPEN],
  [QuoteStatus.GEACCEPTEERD]: [],
  [QuoteStatus.AFGEWEZEN]: [],
  [QuoteStatus.VERLOPEN]: [],
};

export function calculateLineTotal(quantity: number, unitPrice: number, discountPct: number): number {
  return Math.round(quantity * unitPrice * (1 - discountPct / 100) * 100) / 100;
}

export const QUOTE_INCLUDE = {
  contact: { select: { id: true, type: true, companyName: true, firstName: true, lastName: true, email: true } },
  location: { select: { id: true, name: true, city: true, street: true, houseNumber: true, postalCode: true } },
  request: { select: { id: true, title: true } },
  template: { select: { id: true, name: true, templateType: true, docxStorageKey: true, sendEmailTemplateId: true, sendEmailEnabled: true, acceptedEmailTemplateId: true, acceptedEmailEnabled: true } },
  createdByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
  lines: {
    include: { product: { select: { id: true, name: true, unit: true, productGroupId: true } } },
    orderBy: { sortOrder: 'asc' as const },
  },
  approvalRequests: {
    include: {
      requestedByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      reviewedByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { requestedAt: 'desc' as const },
  },
  questions: {
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  attachments: { orderBy: { sortOrder: 'asc' as const } },
  project: { select: { id: true, projectNumber: true } },
};

/** Org-scoped quote lookup with full includes (shared by all quote services). */
export async function findQuoteForUser(prisma: PrismaService, id: string, user: User) {
  const quote = assertFound(await prisma.quote.findUnique({ where: { id }, include: QUOTE_INCLUDE }), 'Offerte');
  if (!user.roles.includes(Role.SUPERUSER) && quote.orgId !== user.orgId) throw new ForbiddenException();
  return quote;
}

export function getPublicUrl(config: ConfigService, path: string): string {
  const baseUrl = config.get<string>('PUBLIC_URL', 'http://localhost:5173');
  return `${baseUrl}${path}`;
}

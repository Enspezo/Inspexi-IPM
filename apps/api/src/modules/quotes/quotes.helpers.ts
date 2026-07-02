import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role, User, QuoteStatus, QuoteTemplate } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma';
import { assertFound } from '@/common';

/**
 * The subset of template fields that gets applied onto a quote when a template
 * is linked. For a `BLOCKS` template this includes the cover/content/closing
 * blocks; for a `DOCX` template only the metadata is applicable (the document
 * is rendered from the uploaded .docx, so blocks do not apply).
 */
export interface ResolvedTemplateData {
  coverBlocks?: QuoteTemplate['coverBlocks'];
  contentBlocks?: QuoteTemplate['contentBlocks'];
  closingBlocks?: QuoteTemplate['closingBlocks'];
  defaultValidityDays?: number;
  requiresApproval?: boolean;
}

/**
 * Resolve which template fields apply to a quote, branching on template type.
 * Shared by `create()` (initial application) and `update()` (template switch)
 * so the DOCX-vs-BLOCKS rule lives in exactly one place.
 *
 * - `DOCX` → only metadata (`defaultValidityDays`, `requiresApproval`); no blocks.
 * - `BLOCKS` (default) → blocks + metadata.
 */
export function resolveTemplateData(template: QuoteTemplate): ResolvedTemplateData {
  if (template.templateType === 'DOCX') {
    // DOCX templates only contribute metadata — block content is not applicable
    return {
      defaultValidityDays: template.defaultValidityDays,
      requiresApproval: template.requiresApproval,
    };
  }
  return {
    coverBlocks: template.coverBlocks,
    contentBlocks: template.contentBlocks,
    closingBlocks: template.closingBlocks,
    defaultValidityDays: template.defaultValidityDays,
    requiresApproval: template.requiresApproval,
  };
}

/**
 * Guard that a quote has a template linked before it may leave the CONCEPT
 * status. Call on every path that transitions a CONCEPT quote forward
 * (status change, send, submit-for-approval).
 */
export function assertTemplateLinked(quote: { templateId: string | null }): void {
  if (!quote.templateId) {
    throw new BadRequestException(
      'Koppel eerst een offertesjabloon voordat u de status van concept wijzigt.',
    );
  }
}

/**
 * Whether a quote may not be sent without an approved *mandatory* approval (REQ5).
 *
 * Two independent triggers, OR-combined:
 *  - **Org threshold** — both `quoteApprovalThreshold` and `quoteApprovalRequiredRole`
 *    are configured AND the quote total is *strictly* above the threshold.
 *  - **Template** — the quote's linked template set `requiresApproval`.
 *
 * Voluntary (advisory) approval requests never affect this — they neither set it
 * nor clear it.
 */
export function isQuoteApprovalRequired(
  org: { quoteApprovalThreshold: unknown | null; quoteApprovalRequiredRole: Role | null },
  quote: { total: unknown; requiresApproval: boolean },
): boolean {
  const thresholdActive =
    org.quoteApprovalThreshold !== null &&
    org.quoteApprovalThreshold !== undefined &&
    org.quoteApprovalRequiredRole !== null &&
    Number(quote.total) > Number(org.quoteApprovalThreshold);
  return thresholdActive || quote.requiresApproval;
}

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

/** Convert a Prisma.Decimal (or null) to a JS number, preserving null/undefined. */
function toNum(value: unknown): number | null {
  if (value === null || value === undefined) return value as null;
  return Number(value);
}

/** Override the listed keys K of T to `number` (preserving null on nullable keys). */
type MoneyToNumber<T, K extends string> = T extends null | undefined
  ? T
  : Omit<T, K & keyof T> & {
      [P in K & keyof T]: null extends T[P] ? number | null : number;
    };

type SerializedQuoteLine<L> = MoneyToNumber<L, 'unitPrice' | 'lineTotal'>;
type SerializedQuote<T> = T extends null | undefined
  ? T
  : MoneyToNumber<T, 'subtotal' | 'discountTotal' | 'vatTotal' | 'total'> &
      (T extends { lines: infer L extends readonly any[] }
        ? { lines: SerializedQuoteLine<L[number]>[] }
        : unknown);

/**
 * Serialize a quote (with lines) so the money fields are plain numbers instead of
 * Prisma.Decimal. Prisma.Decimal serializes to a string in JSON; the portal expects numbers.
 * Safe to call on any quote-shaped object (lines optional).
 */
export function serializeQuote<T extends Record<string, any> | null | undefined>(
  quote: T,
): SerializedQuote<T> {
  if (!quote) return quote as SerializedQuote<T>;
  const lines = Array.isArray((quote as any).lines)
    ? (quote as any).lines.map((line: any) => ({
        ...line,
        unitPrice: toNum(line.unitPrice),
        lineTotal: toNum(line.lineTotal),
      }))
    : (quote as any).lines;
  return {
    ...(quote as any),
    subtotal: toNum((quote as any).subtotal),
    discountTotal: toNum((quote as any).discountTotal),
    vatTotal: toNum((quote as any).vatTotal),
    total: toNum((quote as any).total),
    ...(lines !== undefined ? { lines } : {}),
  } as SerializedQuote<T>;
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

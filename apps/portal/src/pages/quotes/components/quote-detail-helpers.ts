import { QuoteStatus, ApprovalKind, ApprovalStatus } from '@/types';
import type { Quote } from '@/types';

// Gedeelde formatter (lange maand mét tijd) — her-geëxporteerd zodat bestaande
// imports uit dit helpers-bestand blijven werken.
export { formatDateTimeLong } from '@/lib/format';

export function getContactName(contact?: { companyName?: string | null; firstName?: string | null; lastName?: string | null }): string {
  if (!contact) return '—';
  if (contact.companyName) return contact.companyName;
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
}

export interface QuoteApprovalState {
  /** Effectieve goedkeuringsplicht: org-drempel ÓF template-vlag (B-304). */
  approvalRequired: boolean;
  /** Er is al een GOEDGEKEURD verplicht (THRESHOLD) verzoek. */
  hasApprovedMandatory: boolean;
  /** CONCEPT + goedkeuring vereist → toon "Ter goedkeuring". */
  showSubmitApproval: boolean;
  /** CONCEPT + géén goedkeuring vereist → toon "Goedkeuren" (directe statusovergang). */
  showDirectApprove: boolean;
  /** Versturen geblokkeerd zolang de verplichte goedkeuring ontbreekt. */
  sendBlockedByApproval: boolean;
}

/**
 * Actiemenu-staat voor de offerte-detailpagina (B-304-regressiebescherming).
 *
 * Stuurt op het server-side berekende `quote.approvalRequired` — één bron van
 * waarheid met de backend-gate (`isQuoteApprovalRequired`). Het veld ontbreekt
 * alleen bij verouderde/lijst-payloads; dan is de template-vlag de best
 * beschikbare benadering.
 */
export function getQuoteApprovalState(
  quote: Pick<Quote, 'status' | 'requiresApproval' | 'approvalRequired' | 'approvalRequests'>,
): QuoteApprovalState {
  const approvalRequired = quote.approvalRequired ?? quote.requiresApproval;
  const hasApprovedMandatory = (quote.approvalRequests ?? []).some(
    (a) => a.kind === ApprovalKind.THRESHOLD && a.status === ApprovalStatus.APPROVED,
  );
  const isConcept = quote.status === QuoteStatus.CONCEPT;
  return {
    approvalRequired,
    hasApprovedMandatory,
    showSubmitApproval: isConcept && approvalRequired,
    showDirectApprove: isConcept && !approvalRequired,
    sendBlockedByApproval: approvalRequired && !hasApprovedMandatory,
  };
}

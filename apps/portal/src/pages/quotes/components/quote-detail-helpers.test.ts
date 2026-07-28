import { describe, it, expect } from 'vitest';
import { getQuoteApprovalState } from './quote-detail-helpers';
import { QuoteStatus, ApprovalKind, ApprovalStatus } from '@/types';
import type { Quote, QuoteApprovalRequest } from '@/types';

type ApprovalStateInput = Pick<
  Quote,
  'status' | 'requiresApproval' | 'approvalRequired' | 'approvalRequests'
>;

const makeQuote = (overrides: Partial<ApprovalStateInput> = {}): ApprovalStateInput => ({
  status: QuoteStatus.CONCEPT,
  requiresApproval: false,
  approvalRequired: false,
  approvalRequests: [],
  ...overrides,
});

const approvedThresholdRequest = {
  id: 'req-1',
  quoteId: 'quote-1',
  requestedBy: 'user-1',
  reviewedBy: 'user-2',
  status: ApprovalStatus.APPROVED,
  kind: ApprovalKind.THRESHOLD,
  approverRole: null,
  approverUserId: null,
  note: null,
  requestedAt: '2026-07-01T10:00:00Z',
  reviewedAt: '2026-07-01T11:00:00Z',
} as QuoteApprovalRequest;

describe('getQuoteApprovalState (B-304-regressie)', () => {
  it('toont "Ter goedkeuring" boven de drempel, óók zonder template-vlag (de B-304-bug)', () => {
    // Server berekende approvalRequired=true (drempel), maar requiresApproval=false —
    // exact het scenario waarin de oude UI de knop liet wegvallen.
    const state = getQuoteApprovalState(
      makeQuote({ approvalRequired: true, requiresApproval: false }),
    );

    expect(state.showSubmitApproval).toBe(true);
    expect(state.showDirectApprove).toBe(false);
    expect(state.sendBlockedByApproval).toBe(true);
  });

  it('toont "Goedkeuren" (directe overgang) wanneer geen goedkeuring vereist is', () => {
    const state = getQuoteApprovalState(makeQuote());

    expect(state.showSubmitApproval).toBe(false);
    expect(state.showDirectApprove).toBe(true);
    expect(state.sendBlockedByApproval).toBe(false);
  });

  it('valt terug op de template-vlag wanneer approvalRequired ontbreekt (oude payloads)', () => {
    const state = getQuoteApprovalState(
      makeQuote({ approvalRequired: undefined, requiresApproval: true }),
    );

    expect(state.approvalRequired).toBe(true);
    expect(state.showSubmitApproval).toBe(true);
  });

  it('deblokkeert versturen zodra er een GOEDGEKEURD verplicht (THRESHOLD) verzoek is', () => {
    const state = getQuoteApprovalState(
      makeQuote({
        approvalRequired: true,
        approvalRequests: [approvedThresholdRequest],
      }),
    );

    expect(state.hasApprovedMandatory).toBe(true);
    expect(state.sendBlockedByApproval).toBe(false);
  });

  it('telt vrijwillige goedkeuringen niet mee voor de verstuurgate', () => {
    const state = getQuoteApprovalState(
      makeQuote({
        approvalRequired: true,
        approvalRequests: [
          { ...approvedThresholdRequest, kind: ApprovalKind.VOLUNTARY_PERSON },
        ],
      }),
    );

    expect(state.hasApprovedMandatory).toBe(false);
    expect(state.sendBlockedByApproval).toBe(true);
  });

  it('verbergt beide CONCEPT-acties buiten de CONCEPT-status', () => {
    const state = getQuoteApprovalState(
      makeQuote({ status: QuoteStatus.TER_GOEDKEURING, approvalRequired: true }),
    );

    expect(state.showSubmitApproval).toBe(false);
    expect(state.showDirectApprove).toBe(false);
  });
});

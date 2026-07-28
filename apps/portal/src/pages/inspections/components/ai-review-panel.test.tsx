import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmProvider, ToastProvider } from '@/components/ui';
import { AiReviewPanel, sortItems } from './ai-review-panel';
import {
  AiReviewItemSeverity,
  AiReviewItemStatus,
  AiReviewRunStatus,
  type AiReviewItem,
  type AiReviewRun,
} from '@/types';
import {
  useAiReview,
  useAiReviewStatus,
  useStartAiReview,
  useUpdateAiReviewItem,
} from '../hooks/use-ai-review';

vi.mock('../hooks/use-ai-review', () => ({
  useAiReview: vi.fn(),
  useAiReviewStatus: vi.fn(),
  useStartAiReview: vi.fn(),
  useUpdateAiReviewItem: vi.fn(),
}));

const item = (over: Partial<AiReviewItem>): AiReviewItem =>
  ({
    id: 'i1', orgId: 'o1', runId: 'r1',
    severity: AiReviewItemSeverity.INFO, category: 'OVERIG',
    title: 'Titel', description: 'Omschrijving',
    assetNodeId: null, findingId: null, measurementRecordId: null,
    status: AiReviewItemStatus.OPEN, checkedBy: null, checkedAt: null,
    sortOrder: 0, createdAt: '2026-07-16T08:00:00.000Z',
    ...over,
  }) as AiReviewItem;

const run = (over: Partial<AiReviewRun>): AiReviewRun =>
  ({
    id: 'r1', orgId: 'o1', inspectionPlanId: 'p1', generatedDocumentId: null,
    status: AiReviewRunStatus.COMPLETED, triggeredBy: null, model: 'claude-test',
    summary: 'Samenvatting van de AI.', errorMessage: null,
    inputTokens: null, outputTokens: null,
    startedAt: null, completedAt: '2026-07-16T08:05:00.000Z',
    createdAt: '2026-07-16T08:00:00.000Z', items: [],
    ...over,
  }) as AiReviewRun;

const startMutateAsync = vi.fn().mockResolvedValue({});
const itemMutateAsync = vi.fn().mockResolvedValue({});

function setup(runData: AiReviewRun | null, props: Partial<Parameters<typeof AiReviewPanel>[0]> = {}) {
  vi.mocked(useAiReview).mockReturnValue({ data: runData, isLoading: false } as any);
  vi.mocked(useAiReviewStatus).mockReturnValue({ data: { available: true, model: 'claude-test' } } as any);
  vi.mocked(useStartAiReview).mockReturnValue({ mutateAsync: startMutateAsync, isPending: false } as any);
  vi.mocked(useUpdateAiReviewItem).mockReturnValue({ mutateAsync: itemMutateAsync, isPending: false } as any);
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <AiReviewPanel planId="p1" canReview aiEnabled {...props} />
      </ConfirmProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  startMutateAsync.mockResolvedValue({});
  itemMutateAsync.mockResolvedValue({});
});

describe('sortItems', () => {
  it('sorteert CRITICAL bovenaan en laat behandelde items naar beneden zakken', () => {
    const sorted = sortItems([
      item({ id: 'a', severity: AiReviewItemSeverity.INFO, sortOrder: 0 }),
      item({ id: 'b', severity: AiReviewItemSeverity.CRITICAL, sortOrder: 1, status: AiReviewItemStatus.CHECKED }),
      item({ id: 'c', severity: AiReviewItemSeverity.CRITICAL, sortOrder: 2 }),
      item({ id: 'd', severity: AiReviewItemSeverity.WARNING, sortOrder: 3 }),
    ]);
    // Open items eerst (CRITICAL > WARNING > INFO), daarna de behandelde.
    expect(sorted.map((i) => i.id)).toEqual(['c', 'd', 'a', 'b']);
  });
});

describe('AiReviewPanel', () => {
  it('toont "AI-analyse bezig…" bij een PENDING-run', () => {
    setup(run({ status: AiReviewRunStatus.PENDING, summary: null, completedAt: null }));
    expect(screen.getByText('AI-analyse bezig…')).toBeInTheDocument();
    expect(screen.queryByText('AI-analyse opnieuw uitvoeren')).not.toBeInTheDocument();
  });

  it('rendert items gesorteerd met teller en samenvatting bij COMPLETED', () => {
    setup(
      run({
        items: [
          item({ id: 'a', title: 'Info-punt', severity: AiReviewItemSeverity.INFO, sortOrder: 0 }),
          item({ id: 'b', title: 'Kritiek punt', severity: AiReviewItemSeverity.CRITICAL, sortOrder: 1 }),
          item({ id: 'c', title: 'Afgevinkt punt', status: AiReviewItemStatus.CHECKED, sortOrder: 2 }),
        ],
      }),
    );
    expect(screen.getByText('Samenvatting van de AI.')).toBeInTheDocument();
    expect(screen.getByText('1 van 3 punten behandeld')).toBeInTheDocument();
    const titles = screen
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(titles[0]).toContain('Kritiek punt');
    expect(titles[1]).toContain('Info-punt');
    expect(titles[2]).toContain('Afgevinkt punt');
  });

  it('vinkt een item af via de ✓-knop (CHECKED-mutatie)', () => {
    setup(run({ items: [item({ id: 'a', title: 'Open punt' })] }));
    fireEvent.click(screen.getByRole('button', { name: 'Afvinken: Open punt' }));
    expect(itemMutateAsync).toHaveBeenCalledWith({
      itemId: 'a',
      status: AiReviewItemStatus.CHECKED,
    });
  });

  it('verbergt afvink-/afwijs-/her-run-knoppen zonder review-rol', () => {
    setup(run({ items: [item({ id: 'a', title: 'Open punt' })] }), { canReview: false });
    expect(screen.queryByRole('button', { name: 'Afvinken: Open punt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Afwijzen/ })).not.toBeInTheDocument();
    expect(screen.queryByText('AI-analyse opnieuw uitvoeren')).not.toBeInTheDocument();
  });

  it('toont de foutmelding en een Opnieuw-knop bij FAILED', () => {
    setup(run({ status: AiReviewRunStatus.FAILED, errorMessage: 'De AI-analyse is mislukt: timeout', summary: null }));
    expect(screen.getByText('De AI-analyse is mislukt: timeout')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Opnieuw' }));
    expect(startMutateAsync).toHaveBeenCalled();
  });

  it('rendert niets zonder run wanneer er ook geen run gestart kan worden', () => {
    setup(null, { aiEnabled: false });
    expect(screen.queryByText('AI-voorcontrole')).not.toBeInTheDocument();
  });
});

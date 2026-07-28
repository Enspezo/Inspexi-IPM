// AI-controle-paneel op de inspectie-detailpagina (PRD-13 §13.9.1).
// Adviserend, nooit blokkerend: de reviewer vinkt punten af of wijst ze af;
// geen enkel AI-resultaat houdt een statustransitie tegen.
import { useMemo } from 'react';
import { Button, Card, Spinner, StatusBadge, useConfirm, useToast } from '@/components/ui';
import { AI_REVIEW_SEVERITY } from '@/lib/status';
import { formatDateTime } from '@/lib/format';
import type { AiReviewItem } from '@/types';
import { AiReviewItemSeverity, AiReviewItemStatus, AiReviewRunStatus } from '@/types';
import {
  useAiReview,
  useAiReviewStatus,
  useStartAiReview,
  useUpdateAiReviewItem,
} from '../hooks/use-ai-review';

const SEVERITY_ORDER: AiReviewItemSeverity[] = [
  AiReviewItemSeverity.CRITICAL,
  AiReviewItemSeverity.WARNING,
  AiReviewItemSeverity.SUGGESTION,
  AiReviewItemSeverity.INFO,
];

/** NL-labels voor de prompt-taxonomie; onbekende categorieën tonen de ruwe waarde. */
const CATEGORY_LABELS: Record<string, string> = {
  VOLLEDIGHEID: 'Volledigheid',
  CONSISTENTIE: 'Consistentie',
  NORMERING: 'Normering',
  TAAL: 'Taal',
  OVERIG: 'Overig',
};

interface AiReviewPanelProps {
  planId: string;
  /** Mag afvinken/afwijzen en (her)runnen (canReviewRoles). */
  canReview: boolean;
  /** Org-toggle `aiReviewEnabled` — bepaalt of een nieuwe run gestart kan worden. */
  aiEnabled: boolean;
  /** Deeplink naar het Assets-tab bij items met een verwijzing. */
  onOpenAssets?: () => void;
}

export function AiReviewPanel({ planId, canReview, aiEnabled, onOpenAssets }: AiReviewPanelProps) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const { data: run, isLoading } = useAiReview(planId);
  const { data: aiStatus } = useAiReviewStatus();
  const startMutation = useStartAiReview(planId);
  const itemMutation = useUpdateAiReviewItem(planId);

  const items = useMemo(() => sortItems(run?.items ?? []), [run?.items]);
  const handledCount = items.filter((i) => i.status !== AiReviewItemStatus.OPEN).length;

  const canStart = canReview && aiEnabled && aiStatus?.available !== false;

  // Geen lege kaart: alleen tonen als er een run is of er één gestart kan worden.
  if (isLoading || (!run && !canStart)) return null;

  const handleStart = async () => {
    try {
      await startMutation.mutateAsync();
      showToast('AI-analyse gestart', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleItemStatus = async (item: AiReviewItem, status: AiReviewItemStatus) => {
    if (status === AiReviewItemStatus.DISMISSED) {
      const confirmed = await confirm({
        title: 'Aandachtspunt afwijzen',
        message: `Weet je zeker dat je "${item.title}" wilt afwijzen als niet van toepassing?`,
        confirmLabel: 'Afwijzen',
      });
      if (!confirmed) return;
    }
    try {
      await itemMutation.mutateAsync({ itemId: item.id, status });
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Card
      title="AI-voorcontrole"
      actions={
        canReview && run && run.status !== AiReviewRunStatus.PENDING ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleStart}
            isLoading={startMutation.isPending}
            disabled={!canStart}
          >
            AI-analyse opnieuw uitvoeren
          </Button>
        ) : undefined
      }
    >
      {!run && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-gray-600">
            Er is nog geen AI-analyse uitgevoerd voor deze inspectie.
          </p>
          <Button
            variant="secondary"
            onClick={handleStart}
            isLoading={startMutation.isPending}
            disabled={!canStart}
          >
            AI-analyse uitvoeren
          </Button>
        </div>
      )}

      {run?.status === AiReviewRunStatus.PENDING && (
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <Spinner size="sm" />
          AI-analyse bezig…
        </div>
      )}

      {run?.status === AiReviewRunStatus.FAILED && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-red-700">
            {run.errorMessage || 'De AI-analyse is mislukt.'}
          </p>
          {canReview && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleStart}
              isLoading={startMutation.isPending}
              disabled={!canStart}
            >
              Opnieuw
            </Button>
          )}
        </div>
      )}

      {run?.status === AiReviewRunStatus.COMPLETED && (
        <div className="space-y-4">
          {run.summary && <p className="text-sm text-gray-700">{run.summary}</p>}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>
              {handledCount} van {items.length} punten behandeld
            </span>
            <span>Model: {run.model}</span>
            {run.completedAt && <span>Uitgevoerd op {formatDateTime(run.completedAt)}</span>}
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-gray-500">De AI heeft geen aandachtspunten gevonden.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map((item) => {
                const handled = item.status !== AiReviewItemStatus.OPEN;
                const dismissed = item.status === AiReviewItemStatus.DISMISSED;
                const hasReference =
                  !!item.assetNodeId || !!item.findingId || !!item.measurementRecordId;
                return (
                  <li key={item.id} className={`py-3 ${dismissed ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge map={AI_REVIEW_SEVERITY} status={item.severity} />
                          <span className="text-xs text-gray-500">
                            {CATEGORY_LABELS[item.category] ?? item.category}
                          </span>
                        </div>
                        <p
                          className={`mt-1 text-sm font-medium text-gray-900 ${
                            item.status === AiReviewItemStatus.CHECKED ? 'line-through' : ''
                          }`}
                        >
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-sm text-gray-600">{item.description}</p>
                        {hasReference && onOpenAssets && (
                          <button
                            type="button"
                            onClick={onOpenAssets}
                            className="mt-1 text-xs font-medium text-primary-600 hover:text-primary-700"
                          >
                            Bekijk in Assets →
                          </button>
                        )}
                      </div>
                      {canReview && (
                        <div className="flex flex-shrink-0 items-center gap-1">
                          {handled ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleItemStatus(item, AiReviewItemStatus.OPEN)}
                            >
                              Heropenen
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Afvinken"
                                aria-label={`Afvinken: ${item.title}`}
                                onClick={() => handleItemStatus(item, AiReviewItemStatus.CHECKED)}
                                className="text-green-700 hover:bg-green-50"
                              >
                                ✓
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Afwijzen"
                                aria-label={`Afwijzen: ${item.title}`}
                                onClick={() => handleItemStatus(item, AiReviewItemStatus.DISMISSED)}
                                className="text-red-700 hover:bg-red-50"
                              >
                                ✗
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

/** CRITICAL bovenaan; behandelde items zakken binnen hun severity naar beneden. */
export function sortItems(items: AiReviewItem[]): AiReviewItem[] {
  return [...items].sort((a, b) => {
    const handledA = a.status === AiReviewItemStatus.OPEN ? 0 : 1;
    const handledB = b.status === AiReviewItemStatus.OPEN ? 0 : 1;
    if (handledA !== handledB) return handledA - handledB;
    const sevA = SEVERITY_ORDER.indexOf(a.severity);
    const sevB = SEVERITY_ORDER.indexOf(b.severity);
    if (sevA !== sevB) return sevA - sevB;
    return a.sortOrder - b.sortOrder;
  });
}

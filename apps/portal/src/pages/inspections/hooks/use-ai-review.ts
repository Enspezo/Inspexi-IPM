// AI-voorcontrole van inspectierapporten (PRD-13 §13.9.1).
// De GET pollt elke 5s zolang de laatste run PENDING is; daarna stopt de poll.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import { aiReviewKeys } from '@/lib/query-keys';
import type { AiReviewItem, AiReviewRun } from '@/types';
import { AiReviewItemStatus, AiReviewRunStatus } from '@/types';

// Stop met pollen wanneer een run al langer dan dit PENDING is: de server boekt
// verweesde PENDING-runs (> 10 min, bv. na een crash mid-run) bij de volgende
// start als FAILED af, dus eindeloos client-pollen heeft geen zin (PR-126).
const PENDING_POLL_CUTOFF_MS = 10 * 60 * 1000;

/** Laatste AI-run (incl. items) van een inspectieplan; null zonder runs. */
export function useAiReview(planId: string | undefined, enabled = true) {
  return useQuery<AiReviewRun | null>({
    queryKey: aiReviewKeys.byPlan(planId as string),
    queryFn: () => apiClient.get<AiReviewRun | null>(`/inspection-plans/${planId}/ai-review`),
    enabled: !!planId && enabled,
    refetchInterval: (query) => {
      const run = query.state.data;
      if (run?.status !== AiReviewRunStatus.PENDING) return false;
      const started = new Date(run.startedAt ?? run.createdAt).getTime();
      // Blijf pollen zolang de run "vers" is; daarna stoppen (mogelijk vastgelopen).
      return Date.now() - started < PENDING_POLL_CUTOFF_MS ? 5000 : false;
    },
  });
}

/** Handmatige (her)run van de AI-voorcontrole. */
export function useStartAiReview(planId: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: () => apiClient.post<AiReviewRun>(`/inspection-plans/${planId}/ai-review`),
    onSuccess: () => qc.invalidateQueries({ queryKey: aiReviewKeys.byPlan(planId) }),
  });
}

/** Item afvinken (CHECKED), afwijzen (DISMISSED) of heropenen (OPEN). */
export function useUpdateAiReviewItem(planId: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: AiReviewItemStatus }) =>
      apiClient.patch<AiReviewItem>(`/ai-review-items/${itemId}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: aiReviewKeys.byPlan(planId) }),
  });
}

/** Beschikbaarheid van de AI-dienst (geen feature-gate — ook voor org-settings). */
export function useAiReviewStatus() {
  return useQuery<{ available: boolean; model: string }>({
    queryKey: aiReviewKeys.status(),
    queryFn: () => apiClient.get<{ available: boolean; model: string }>('/ai-review/status'),
    staleTime: 5 * 60 * 1000, // env-config wijzigt niet tijdens een sessie
  });
}

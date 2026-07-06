import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import { planningKeys } from '@/lib/query-keys';
import type { PlanningHistoryEntry } from '@/types';

export function usePlanningQuestions(id: string | undefined) {
  return useQuery<PlanningHistoryEntry[]>({
    queryKey: planningKeys.questions(id as string),
    queryFn: () => apiClient.get<PlanningHistoryEntry[]>(`/planning/${id}/questions`),
    enabled: !!id,
  });
}

export function useAddPlanningQuestion(id: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (dto: { message: string; isFromClient?: boolean }) =>
      apiClient.post<PlanningHistoryEntry>(`/planning/${id}/questions`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: planningKeys.questions(id as string) }),
  });
}

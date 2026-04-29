import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PlanningHistoryEntry } from '@/types';

export function usePlanningQuestions(id: string | undefined) {
  return useQuery<PlanningHistoryEntry[]>({
    queryKey: ['planning', id, 'questions'],
    queryFn: () => apiClient.get<PlanningHistoryEntry[]>(`/planning/${id}/questions`),
    enabled: !!id,
  });
}

export function useAddPlanningQuestion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { message: string; isFromClient?: boolean }) =>
      apiClient.post<PlanningHistoryEntry>(`/planning/${id}/questions`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planning', id, 'questions'] }),
  });
}

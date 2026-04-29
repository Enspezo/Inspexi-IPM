import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PlanningFollower } from '@/types';

export function usePlanningFollowers(id: string | undefined) {
  return useQuery<PlanningFollower[]>({
    queryKey: ['planning', id, 'followers'],
    queryFn: () => apiClient.get<PlanningFollower[]>(`/planning/${id}/followers`),
    enabled: !!id,
  });
}

export function useAddFollower(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { userId?: string; email?: string; name?: string }) =>
      apiClient.post<PlanningFollower>(`/planning/${id}/followers`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planning', id, 'followers'] }),
  });
}

export function useRemoveFollower(planningItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (followerId: string) =>
      apiClient.delete(`/planning/${planningItemId}/followers/${followerId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['planning', planningItemId, 'followers'] }),
  });
}

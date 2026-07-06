import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import { planningKeys } from '@/lib/query-keys';
import type { PlanningFollower } from '@/types';

export function usePlanningFollowers(id: string | undefined) {
  return useQuery<PlanningFollower[]>({
    queryKey: planningKeys.followers(id as string),
    queryFn: () => apiClient.get<PlanningFollower[]>(`/planning/${id}/followers`),
    enabled: !!id,
  });
}

export function useAddFollower(id: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (dto: { userId?: string; email?: string; name?: string }) =>
      apiClient.post<PlanningFollower>(`/planning/${id}/followers`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: planningKeys.followers(id as string) }),
  });
}

export function useRemoveFollower(planningItemId: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (followerId: string) =>
      apiClient.delete(`/planning/${planningItemId}/followers/${followerId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: planningKeys.followers(planningItemId) }),
  });
}

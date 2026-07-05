import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  planKeys,
  featureCatalogKeys,
  organizationEntitlementKeys,
} from '@/lib/query-keys';
import type { FeatureDef, Plan } from '@/lib/entitlements';

export function usePlans() {
  return useQuery<Plan[]>({
    queryKey: planKeys.all,
    queryFn: () => apiClient.get<Plan[]>('/plans'),
  });
}

export function usePlan(id: string) {
  return useQuery<Plan>({
    queryKey: planKeys.detail(id),
    queryFn: () => apiClient.get<Plan>(`/plans/${id}`),
    enabled: !!id,
  });
}

/** Feature-catalogus (keys/labels/afhankelijkheden) — bron voor de checkbox-lijst. */
export function useFeatureCatalog() {
  return useQuery<FeatureDef[]>({
    queryKey: featureCatalogKeys.all,
    queryFn: () => apiClient.get<FeatureDef[]>('/admin/features'),
    staleTime: 30 * 60 * 1000, // catalogus zit in code; verandert zelden
  });
}

interface CreatePlanInput {
  name: string;
  slug: string;
  description?: string;
  sortOrder?: number;
  featureKeys: string[];
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePlanInput) => apiClient.post<Plan>('/plans', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planKeys.all });
    },
  });
}

interface UpdatePlanInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  featureKeys?: string[];
}

export function useUpdatePlan(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdatePlanInput) => apiClient.patch<Plan>(`/plans/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planKeys.all });
      queryClient.invalidateQueries({ queryKey: planKeys.detail(id) });
      // Plan-wijzigingen kunnen de effectieve set van toegewezen orgs raken.
      queryClient.invalidateQueries({ queryKey: organizationEntitlementKeys.all });
    },
  });
}

export function useDeletePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/plans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planKeys.all });
    },
  });
}

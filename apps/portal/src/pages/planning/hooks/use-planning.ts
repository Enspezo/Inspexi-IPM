import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useToast } from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import { planningKeys } from '@/lib/query-keys';
import { makeAvailabilityAwareOnError } from '../lib/availability-warnings';
import type { PlanningItem, PlanningStatus } from '@/types';

interface ListPlanningParams {
  search?: string;
  status?: PlanningStatus;
  inspectorId?: string;
  contactId?: string;
  dateFrom?: string;
  dateTo?: string;
  showCancelled?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  enabled?: boolean;
}

interface PlanningListResponse {
  data: PlanningItem[];
  total: number;
  page: number;
  limit: number;
}

export function usePlanningItems(params: ListPlanningParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.status) queryParams.set('status', params.status);
  if (params.inspectorId) queryParams.set('inspectorId', params.inspectorId);
  if (params.contactId) queryParams.set('contactId', params.contactId);
  if (params.dateFrom) queryParams.set('dateFrom', params.dateFrom);
  if (params.dateTo) queryParams.set('dateTo', params.dateTo);
  if (params.showCancelled) queryParams.set('showCancelled', 'true');
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));
  if (params.sortBy) queryParams.set('sortBy', params.sortBy);
  if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);

  const qs = queryParams.toString();
  return useQuery<PlanningListResponse>({
    queryKey: planningKeys.list(params),
    queryFn: () => apiClient.get<PlanningListResponse>(`/planning${qs ? `?${qs}` : ''}`),
    enabled: params.enabled,
  });
}

export function usePlanningItem(id: string | undefined) {
  return useQuery<PlanningItem>({
    queryKey: planningKeys.detail(id as string),
    queryFn: () => apiClient.get<PlanningItem>(`/planning/${id}`),
    enabled: !!id,
  });
}

export function useCreatePlanningItem() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (dto: any) => apiClient.post<PlanningItem>('/planning', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: planningKeys.all }),
  });
}

export function useUpdatePlanningItem(id: string) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  return useApiMutation({
    mutationFn: (dto: any) => apiClient.patch<PlanningItem>(`/planning/${id}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: planningKeys.detail(id as string) });
      qc.invalidateQueries({ queryKey: planningKeys.all });
    },
    // Beschikbaarheids-409 (verzetten) wordt via de override-flow afgehandeld.
    onError: makeAvailabilityAwareOnError(showToast),
  });
}

export function useUpdatePlanningStatus(id: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (dto: { status: string; note?: string }) =>
      apiClient.patch<PlanningItem>(`/planning/${id}/status`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: planningKeys.detail(id as string) });
      qc.invalidateQueries({ queryKey: planningKeys.all });
    },
  });
}

export function useAssignInspectors(id: string) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  return useApiMutation({
    mutationFn: (dto: {
      inspectorIds: string[];
      primaryInspectorId?: string;
      overrideAvailabilityWarnings?: boolean;
    }) => apiClient.post<PlanningItem>(`/planning/${id}/assign`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: planningKeys.detail(id as string) });
      qc.invalidateQueries({ queryKey: planningKeys.all });
    },
    // Beschikbaarheids-409 wordt via de override-flow afgehandeld.
    onError: makeAvailabilityAwareOnError(showToast),
  });
}

export function useAcceptPlanningItem(id: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: () => apiClient.post(`/planning/${id}/accept`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: planningKeys.detail(id as string) }),
  });
}

export function useRejectPlanningItem(id: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (dto: { reason: string }) => apiClient.post(`/planning/${id}/reject`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: planningKeys.detail(id as string) }),
  });
}

export function useCompletePlanningItem(id: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: () => apiClient.post(`/planning/${id}/complete`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: planningKeys.detail(id as string) });
      qc.invalidateQueries({ queryKey: planningKeys.all });
    },
  });
}

export function useReschedulePlanningItem(id: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (dto: { reason: string }) => apiClient.post<PlanningItem>(`/planning/${id}/reschedule`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: planningKeys.all }),
  });
}

export function useSendConfirmation(id: string) {
  return useApiMutation({
    mutationFn: () => apiClient.post(`/planning/${id}/send-confirmation`, {}),
  });
}

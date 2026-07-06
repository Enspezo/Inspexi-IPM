import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import { inspectionPlanKeys } from '@/lib/query-keys';
import type { InspectionPlan, PaginatedResponse } from '@/types';

interface ListParams {
  search?: string;
  statusCode?: string;
  contactId?: string;
  onlyMine?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function useInspectionPlans(params: ListParams = {}) {
  const qp = new URLSearchParams();
  if (params.search) qp.set('search', params.search);
  if (params.statusCode) qp.set('statusCode', params.statusCode);
  if (params.contactId) qp.set('contactId', params.contactId);
  if (params.onlyMine) qp.set('onlyMine', 'true');
  if (params.page) qp.set('page', String(params.page));
  if (params.limit) qp.set('limit', String(params.limit));
  if (params.sortBy) qp.set('sortBy', params.sortBy);
  if (params.sortOrder) qp.set('sortOrder', params.sortOrder);
  const qs = qp.toString();

  return useQuery<PaginatedResponse<InspectionPlan>>({
    queryKey: inspectionPlanKeys.list(params),
    queryFn: () => apiClient.get<PaginatedResponse<InspectionPlan>>(`/inspection-plans${qs ? `?${qs}` : ''}`),
  });
}

export function useInspectionPlan(id: string) {
  return useQuery<InspectionPlan>({
    queryKey: inspectionPlanKeys.detail(id),
    queryFn: () => apiClient.get<InspectionPlan>(`/inspection-plans/${id}`),
    enabled: !!id,
  });
}

export function useCreateInspectionPlan() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<InspectionPlan>('/inspection-plans', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: inspectionPlanKeys.all }),
  });
}

export function useUpdateInspectionPlan() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiClient.patch<InspectionPlan>(`/inspection-plans/${id}`, data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: inspectionPlanKeys.all });
      qc.invalidateQueries({ queryKey: inspectionPlanKeys.detail(v.id) });
    },
  });
}

/** Indienen ter beoordeling. */
export function useSubmitInspectionPlan() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => apiClient.post<InspectionPlan>(`/inspection-plans/${id}/submit`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: inspectionPlanKeys.all });
      qc.invalidateQueries({ queryKey: inspectionPlanKeys.detail(id) });
    },
  });
}

/** Review-actie (backoffice): goedkeuren/afkeuren. */
export function useReviewInspectionPlan() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, decision, notes }: { id: string; decision: 'approve' | 'reject'; notes?: string }) =>
      apiClient.post<InspectionPlan>(`/inspection-plans/${id}/review`, { decision, notes }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: inspectionPlanKeys.all });
      qc.invalidateQueries({ queryKey: inspectionPlanKeys.detail(v.id) });
    },
  });
}

export function useDeleteInspectionPlan() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => apiClient.delete(`/inspection-plans/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: inspectionPlanKeys.all }),
  });
}

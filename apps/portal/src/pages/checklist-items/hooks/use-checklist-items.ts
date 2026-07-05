// Hooks-laag voor de checklist-items bibliotheek: lijst + detail + CRUD.
// TanStack Query; categorie-beheer gebeurt via de gedeelde hooks in @/lib/categories.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { checklistItemKeys } from '@/lib/query-keys';
import type { ChecklistItem } from '@/types';

export interface UseChecklistItemsParams {
  categoryId?: string;
  search?: string;
  includeSystem?: boolean;
}

export function useChecklistItems(params: UseChecklistItemsParams = {}) {
  const qp = new URLSearchParams();
  if (params.categoryId) qp.set('categoryId', params.categoryId);
  if (params.search) qp.set('search', params.search);
  if (params.includeSystem === false) qp.set('includeSystem', 'false');
  const qs = qp.toString();

  return useQuery<ChecklistItem[]>({
    queryKey: checklistItemKeys.list(params),
    queryFn: () => apiClient.get<ChecklistItem[]>(`/checklist-items${qs ? `?${qs}` : ''}`),
  });
}

export function useChecklistItem(id: string) {
  return useQuery<ChecklistItem>({
    queryKey: checklistItemKeys.detail(id),
    queryFn: () => apiClient.get<ChecklistItem>(`/checklist-items/${id}`),
    enabled: !!id,
  });
}

export function useCreateChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<ChecklistItem>('/checklist-items', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: checklistItemKeys.all }),
  });
}

export function useUpdateChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiClient.patch<ChecklistItem>(`/checklist-items/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: checklistItemKeys.all }),
  });
}

export function useDeleteChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/checklist-items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: checklistItemKeys.all }),
  });
}

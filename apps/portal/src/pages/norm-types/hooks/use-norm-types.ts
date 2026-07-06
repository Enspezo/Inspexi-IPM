// Hooks-laag voor het norm-types domein: lijst + detail + CRUD + soft-delete/restore.
// TanStack Query, queryKeys als arrays, mutaties invalideren ['norm-types'] (+ detail).
// NB: dit model gebruikt 'label' i.p.v. 'name' en heeft een 'deletedAt' soft-delete veld.
// Schrijfacties zijn SUPERUSER-only (backend dwingt dit af).

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import { normTypeKeys } from '@/lib/query-keys';
import type { NormTypeDefinition } from '@/types';

export interface UseNormTypesParams {
  includeInactive?: boolean;
  includeDeleted?: boolean;
}

export function useNormTypes(params: UseNormTypesParams = {}) {
  const query = new URLSearchParams();
  if (params.includeInactive) query.set('includeInactive', 'true');
  if (params.includeDeleted) query.set('includeDeleted', 'true');
  const qs = query.toString();

  return useQuery<NormTypeDefinition[]>({
    queryKey: normTypeKeys.list(params),
    queryFn: () => apiClient.get<NormTypeDefinition[]>(`/norm-types${qs ? `?${qs}` : ''}`),
  });
}

export function useNormType(id: string) {
  return useQuery<NormTypeDefinition>({
    queryKey: normTypeKeys.detail(id),
    queryFn: () => apiClient.get<NormTypeDefinition>(`/norm-types/${id}`),
    enabled: !!id,
  });
}

export function useCreateNormType() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<NormTypeDefinition>('/norm-types', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: normTypeKeys.all }),
  });
}

export function useUpdateNormType() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiClient.patch<NormTypeDefinition>(`/norm-types/${id}`, data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: normTypeKeys.all });
      qc.invalidateQueries({ queryKey: normTypeKeys.detail(v.id) });
    },
  });
}

/** Soft-delete: zet deletedAt. */
export function useDeleteNormType() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => apiClient.delete(`/norm-types/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: normTypeKeys.all });
      qc.invalidateQueries({ queryKey: normTypeKeys.detail(id) });
    },
  });
}

/** Herstel een soft-deleted normtype (deletedAt = null). */
export function useRestoreNormType() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => apiClient.patch<NormTypeDefinition>(`/norm-types/${id}/restore`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: normTypeKeys.all });
      qc.invalidateQueries({ queryKey: normTypeKeys.detail(id) });
    },
  });
}

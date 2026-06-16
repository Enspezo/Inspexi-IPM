// Hooks-laag voor het asset-types domein: lijst + detail + CRUD + velden + constraints.
// TanStack Query, queryKeys als arrays, mutaties invalideren de relevante keys.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { AssetTypeDefinition, AssetTypeField, AssetTypeConstraint } from '@/types';

export interface UseAssetTypesParams {
  normType?: string;
}

// ---------------------------------------------------------------------------
// Asset-type definitie (lijst + detail + CRUD)
// ---------------------------------------------------------------------------

export function useAssetTypes(params: UseAssetTypesParams = {}) {
  const query = new URLSearchParams();
  if (params.normType) query.set('normType', params.normType);
  const qs = query.toString();

  return useQuery<AssetTypeDefinition[]>({
    queryKey: ['asset-types', params],
    queryFn: () => apiClient.get<AssetTypeDefinition[]>(`/asset-types${qs ? `?${qs}` : ''}`),
  });
}

export function useAssetType(id: string) {
  return useQuery<AssetTypeDefinition>({
    queryKey: ['asset-types', id],
    queryFn: () => apiClient.get<AssetTypeDefinition>(`/asset-types/${id}`),
    enabled: !!id,
  });
}

export function useCreateAssetType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<AssetTypeDefinition>('/asset-types', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['asset-types'] }),
  });
}

export function useUpdateAssetType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiClient.patch<AssetTypeDefinition>(`/asset-types/${id}`, data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['asset-types'] });
      qc.invalidateQueries({ queryKey: ['asset-types', v.id] });
    },
  });
}

export function useDeleteAssetType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/asset-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['asset-types'] }),
  });
}

/** System→org kopie; geeft de nieuwe definitie terug. */
export function useDuplicateAssetType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<AssetTypeDefinition>(`/asset-types/${id}/duplicate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['asset-types'] }),
  });
}

// ---------------------------------------------------------------------------
// Velden
// ---------------------------------------------------------------------------

export function useAssetTypeFields(id: string) {
  return useQuery<AssetTypeField[]>({
    queryKey: ['asset-type-fields', id],
    queryFn: () => apiClient.get<AssetTypeField[]>(`/asset-types/${id}/fields`),
    enabled: !!id,
  });
}

export function useCreateAssetTypeField(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<AssetTypeField>(`/asset-types/${id}/fields`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset-type-fields', id] });
      qc.invalidateQueries({ queryKey: ['asset-types', id] });
    },
  });
}

export function useUpdateAssetTypeField(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldId, data }: { fieldId: string; data: Record<string, unknown> }) =>
      apiClient.patch<AssetTypeField>(`/asset-types/${id}/fields/${fieldId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset-type-fields', id] });
      qc.invalidateQueries({ queryKey: ['asset-types', id] });
    },
  });
}

export function useDeleteAssetTypeField(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fieldId: string) =>
      apiClient.delete(`/asset-types/${id}/fields/${fieldId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset-type-fields', id] });
      qc.invalidateQueries({ queryKey: ['asset-types', id] });
    },
  });
}

/** Herorden velden — backend verwacht exact de key `fieldIds`. */
export function useReorderAssetTypeFields(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fieldIds: string[]) =>
      apiClient.post<AssetTypeField[]>(`/asset-types/${id}/fields/reorder`, { fieldIds }),
    // Optimistic: pas de cache-volgorde direct aan; rollback bij fout.
    onMutate: async (fieldIds: string[]) => {
      await qc.cancelQueries({ queryKey: ['asset-type-fields', id] });
      const previous = qc.getQueryData<AssetTypeField[]>(['asset-type-fields', id]);
      if (previous) {
        const byId = new Map(previous.map((f) => [f.id, f]));
        const reordered = fieldIds
          .map((fid) => byId.get(fid))
          .filter((f): f is AssetTypeField => !!f);
        qc.setQueryData<AssetTypeField[]>(['asset-type-fields', id], reordered);
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(['asset-type-fields', id], ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['asset-type-fields', id] });
      qc.invalidateQueries({ queryKey: ['asset-types', id] });
    },
  });
}

// ---------------------------------------------------------------------------
// Constraints (toegestane ouder-types) — PUT vervangt de hele set
// ---------------------------------------------------------------------------

export function useAssetTypeConstraints(id: string) {
  return useQuery<AssetTypeConstraint[]>({
    queryKey: ['asset-type-constraints', id],
    queryFn: () => apiClient.get<AssetTypeConstraint[]>(`/asset-types/${id}/constraints`),
    enabled: !!id,
  });
}

export interface ConstraintInput {
  allowedParentTypeId?: string | null;
  isRequired?: boolean;
}

export function useSetAssetTypeConstraints(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (constraints: ConstraintInput[]) =>
      apiClient.put<AssetTypeConstraint[]>(`/asset-types/${id}/constraints`, { constraints }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset-type-constraints', id] });
      qc.invalidateQueries({ queryKey: ['asset-types', id] });
    },
  });
}

// Hooks-laag voor het asset-types domein: lijst + detail + CRUD + velden + constraints.
// TanStack Query, queryKeys als arrays, mutaties invalideren de relevante keys.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import { assetTypeKeys, assetTypeFieldKeys, assetTypeConstraintKeys } from '@/lib/query-keys';
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
    queryKey: assetTypeKeys.list(params),
    queryFn: () => apiClient.get<AssetTypeDefinition[]>(`/asset-types${qs ? `?${qs}` : ''}`),
  });
}

export function useAssetType(id: string) {
  return useQuery<AssetTypeDefinition>({
    queryKey: assetTypeKeys.detail(id),
    queryFn: () => apiClient.get<AssetTypeDefinition>(`/asset-types/${id}`),
    enabled: !!id,
  });
}

export function useCreateAssetType() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<AssetTypeDefinition>('/asset-types', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: assetTypeKeys.all }),
  });
}

export function useUpdateAssetType() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiClient.patch<AssetTypeDefinition>(`/asset-types/${id}`, data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: assetTypeKeys.all });
      qc.invalidateQueries({ queryKey: assetTypeKeys.detail(v.id) });
    },
  });
}

export function useDeleteAssetType() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => apiClient.delete(`/asset-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: assetTypeKeys.all }),
  });
}

/** System→org kopie; geeft de nieuwe definitie terug. */
export function useDuplicateAssetType() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) =>
      apiClient.post<AssetTypeDefinition>(`/asset-types/${id}/duplicate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: assetTypeKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Velden
// ---------------------------------------------------------------------------

export function useAssetTypeFields(id: string) {
  return useQuery<AssetTypeField[]>({
    queryKey: assetTypeFieldKeys.byType(id),
    queryFn: () => apiClient.get<AssetTypeField[]>(`/asset-types/${id}/fields`),
    enabled: !!id,
  });
}

export function useCreateAssetTypeField(id: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<AssetTypeField>(`/asset-types/${id}/fields`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assetTypeFieldKeys.byType(id) });
      qc.invalidateQueries({ queryKey: assetTypeKeys.detail(id) });
    },
  });
}

export function useUpdateAssetTypeField(id: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ fieldId, data }: { fieldId: string; data: Record<string, unknown> }) =>
      apiClient.patch<AssetTypeField>(`/asset-types/${id}/fields/${fieldId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assetTypeFieldKeys.byType(id) });
      qc.invalidateQueries({ queryKey: assetTypeKeys.detail(id) });
    },
  });
}

export function useDeleteAssetTypeField(id: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (fieldId: string) =>
      apiClient.delete(`/asset-types/${id}/fields/${fieldId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assetTypeFieldKeys.byType(id) });
      qc.invalidateQueries({ queryKey: assetTypeKeys.detail(id) });
    },
  });
}

/** Herorden velden — backend verwacht exact de key `fieldIds`. */
export function useReorderAssetTypeFields(id: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (fieldIds: string[]) =>
      apiClient.post<AssetTypeField[]>(`/asset-types/${id}/fields/reorder`, { fieldIds }),
    // Optimistic: pas de cache-volgorde direct aan; rollback bij fout.
    onMutate: async (fieldIds: string[]) => {
      await qc.cancelQueries({ queryKey: assetTypeFieldKeys.byType(id) });
      const previous = qc.getQueryData<AssetTypeField[]>(assetTypeFieldKeys.byType(id));
      if (previous) {
        const byId = new Map(previous.map((f) => [f.id, f]));
        const reordered = fieldIds
          .map((fid) => byId.get(fid))
          .filter((f): f is AssetTypeField => !!f);
        qc.setQueryData<AssetTypeField[]>(assetTypeFieldKeys.byType(id), reordered);
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(assetTypeFieldKeys.byType(id), ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: assetTypeFieldKeys.byType(id) });
      qc.invalidateQueries({ queryKey: assetTypeKeys.detail(id) });
    },
  });
}

// ---------------------------------------------------------------------------
// Constraints (toegestane ouder-types) — PUT vervangt de hele set
// ---------------------------------------------------------------------------

export function useAssetTypeConstraints(id: string) {
  return useQuery<AssetTypeConstraint[]>({
    queryKey: assetTypeConstraintKeys.byType(id),
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
  return useApiMutation({
    mutationFn: (constraints: ConstraintInput[]) =>
      apiClient.put<AssetTypeConstraint[]>(`/asset-types/${id}/constraints`, { constraints }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assetTypeConstraintKeys.byType(id) });
      qc.invalidateQueries({ queryKey: assetTypeKeys.detail(id) });
    },
  });
}

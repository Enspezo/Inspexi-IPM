// Hooks-laag voor het location-types domein: lijst + detail + CRUD + velden + constraints.
// TanStack Query, queryKeys als arrays, mutaties invalideren de relevante keys.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import { locationTypeKeys, locationTypeFieldKeys, locationTypeConstraintKeys } from '@/lib/query-keys';
import type { LocationTypeDefinition, LocationTypeField, LocationTypeConstraint } from '@/types';

export interface UseLocationTypesParams {
  normType?: string;
  scope?: 'INSPECTION' | 'CRM';
}

// ---------------------------------------------------------------------------
// Locatie-type definitie (lijst + detail + CRUD)
// ---------------------------------------------------------------------------

export function useLocationTypes(params: UseLocationTypesParams = {}) {
  const query = new URLSearchParams();
  if (params.normType) query.set('normType', params.normType);
  if (params.scope) query.set('scope', params.scope);
  const qs = query.toString();

  return useQuery<LocationTypeDefinition[]>({
    queryKey: locationTypeKeys.list(params),
    queryFn: () => apiClient.get<LocationTypeDefinition[]>(`/location-types${qs ? `?${qs}` : ''}`),
  });
}

export function useLocationType(id: string) {
  return useQuery<LocationTypeDefinition>({
    queryKey: locationTypeKeys.detail(id),
    queryFn: () => apiClient.get<LocationTypeDefinition>(`/location-types/${id}`),
    enabled: !!id,
  });
}

export function useCreateLocationType() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<LocationTypeDefinition>('/location-types', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: locationTypeKeys.all }),
  });
}

export function useUpdateLocationType() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiClient.patch<LocationTypeDefinition>(`/location-types/${id}`, data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: locationTypeKeys.all });
      qc.invalidateQueries({ queryKey: locationTypeKeys.detail(v.id) });
    },
  });
}

export function useDeleteLocationType() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => apiClient.delete(`/location-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: locationTypeKeys.all }),
  });
}

/** System→org kopie; geeft de nieuwe definitie terug. */
export function useDuplicateLocationType() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) =>
      apiClient.post<LocationTypeDefinition>(`/location-types/${id}/duplicate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: locationTypeKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Velden
// ---------------------------------------------------------------------------

export function useLocationTypeFields(id: string) {
  return useQuery<LocationTypeField[]>({
    queryKey: locationTypeFieldKeys.byType(id),
    queryFn: () => apiClient.get<LocationTypeField[]>(`/location-types/${id}/fields`),
    enabled: !!id,
  });
}

export function useCreateLocationTypeField(id: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<LocationTypeField>(`/location-types/${id}/fields`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationTypeFieldKeys.byType(id) });
      qc.invalidateQueries({ queryKey: locationTypeKeys.detail(id) });
    },
  });
}

export function useUpdateLocationTypeField(id: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ fieldId, data }: { fieldId: string; data: Record<string, unknown> }) =>
      apiClient.patch<LocationTypeField>(`/location-types/${id}/fields/${fieldId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationTypeFieldKeys.byType(id) });
      qc.invalidateQueries({ queryKey: locationTypeKeys.detail(id) });
    },
  });
}

export function useDeleteLocationTypeField(id: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (fieldId: string) =>
      apiClient.delete(`/location-types/${id}/fields/${fieldId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationTypeFieldKeys.byType(id) });
      qc.invalidateQueries({ queryKey: locationTypeKeys.detail(id) });
    },
  });
}

/** Herorden velden — backend verwacht exact de key `fieldIds`. */
export function useReorderLocationTypeFields(id: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (fieldIds: string[]) =>
      apiClient.post<LocationTypeField[]>(`/location-types/${id}/fields/reorder`, { fieldIds }),
    // Optimistic: pas de cache-volgorde direct aan; rollback bij fout.
    onMutate: async (fieldIds: string[]) => {
      await qc.cancelQueries({ queryKey: locationTypeFieldKeys.byType(id) });
      const previous = qc.getQueryData<LocationTypeField[]>(locationTypeFieldKeys.byType(id));
      if (previous) {
        const byId = new Map(previous.map((f) => [f.id, f]));
        const reordered = fieldIds
          .map((fid) => byId.get(fid))
          .filter((f): f is LocationTypeField => !!f);
        qc.setQueryData<LocationTypeField[]>(locationTypeFieldKeys.byType(id), reordered);
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(locationTypeFieldKeys.byType(id), ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: locationTypeFieldKeys.byType(id) });
      qc.invalidateQueries({ queryKey: locationTypeKeys.detail(id) });
    },
  });
}

// ---------------------------------------------------------------------------
// Constraints (toegestane ouder-types) — PUT vervangt de hele set
// ---------------------------------------------------------------------------

export function useLocationTypeConstraints(id: string) {
  return useQuery<LocationTypeConstraint[]>({
    queryKey: locationTypeConstraintKeys.byType(id),
    queryFn: () => apiClient.get<LocationTypeConstraint[]>(`/location-types/${id}/constraints`),
    enabled: !!id,
  });
}

export interface ConstraintInput {
  allowedParentTypeId?: string | null;
  isRequired?: boolean;
}

export function useSetLocationTypeConstraints(id: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (constraints: ConstraintInput[]) =>
      apiClient.put<LocationTypeConstraint[]>(`/location-types/${id}/constraints`, { constraints }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationTypeConstraintKeys.byType(id) });
      qc.invalidateQueries({ queryKey: locationTypeKeys.detail(id) });
    },
  });
}

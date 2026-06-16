// Hooks-laag voor het location-types domein: lijst + detail + CRUD + velden + constraints.
// TanStack Query, queryKeys als arrays, mutaties invalideren de relevante keys.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { LocationTypeDefinition, LocationTypeField, LocationTypeConstraint } from '@/types';

export interface UseLocationTypesParams {
  normType?: string;
}

// ---------------------------------------------------------------------------
// Locatie-type definitie (lijst + detail + CRUD)
// ---------------------------------------------------------------------------

export function useLocationTypes(params: UseLocationTypesParams = {}) {
  const query = new URLSearchParams();
  if (params.normType) query.set('normType', params.normType);
  const qs = query.toString();

  return useQuery<LocationTypeDefinition[]>({
    queryKey: ['location-types', params],
    queryFn: () => apiClient.get<LocationTypeDefinition[]>(`/location-types${qs ? `?${qs}` : ''}`),
  });
}

export function useLocationType(id: string) {
  return useQuery<LocationTypeDefinition>({
    queryKey: ['location-types', id],
    queryFn: () => apiClient.get<LocationTypeDefinition>(`/location-types/${id}`),
    enabled: !!id,
  });
}

export function useCreateLocationType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<LocationTypeDefinition>('/location-types', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['location-types'] }),
  });
}

export function useUpdateLocationType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiClient.patch<LocationTypeDefinition>(`/location-types/${id}`, data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['location-types'] });
      qc.invalidateQueries({ queryKey: ['location-types', v.id] });
    },
  });
}

export function useDeleteLocationType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/location-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['location-types'] }),
  });
}

/** System→org kopie; geeft de nieuwe definitie terug. */
export function useDuplicateLocationType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<LocationTypeDefinition>(`/location-types/${id}/duplicate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['location-types'] }),
  });
}

// ---------------------------------------------------------------------------
// Velden
// ---------------------------------------------------------------------------

export function useLocationTypeFields(id: string) {
  return useQuery<LocationTypeField[]>({
    queryKey: ['location-type-fields', id],
    queryFn: () => apiClient.get<LocationTypeField[]>(`/location-types/${id}/fields`),
    enabled: !!id,
  });
}

export function useCreateLocationTypeField(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<LocationTypeField>(`/location-types/${id}/fields`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['location-type-fields', id] });
      qc.invalidateQueries({ queryKey: ['location-types', id] });
    },
  });
}

export function useUpdateLocationTypeField(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldId, data }: { fieldId: string; data: Record<string, unknown> }) =>
      apiClient.patch<LocationTypeField>(`/location-types/${id}/fields/${fieldId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['location-type-fields', id] });
      qc.invalidateQueries({ queryKey: ['location-types', id] });
    },
  });
}

export function useDeleteLocationTypeField(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fieldId: string) =>
      apiClient.delete(`/location-types/${id}/fields/${fieldId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['location-type-fields', id] });
      qc.invalidateQueries({ queryKey: ['location-types', id] });
    },
  });
}

/** Herorden velden — backend verwacht exact de key `fieldIds`. */
export function useReorderLocationTypeFields(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fieldIds: string[]) =>
      apiClient.post<LocationTypeField[]>(`/location-types/${id}/fields/reorder`, { fieldIds }),
    // Optimistic: pas de cache-volgorde direct aan; rollback bij fout.
    onMutate: async (fieldIds: string[]) => {
      await qc.cancelQueries({ queryKey: ['location-type-fields', id] });
      const previous = qc.getQueryData<LocationTypeField[]>(['location-type-fields', id]);
      if (previous) {
        const byId = new Map(previous.map((f) => [f.id, f]));
        const reordered = fieldIds
          .map((fid) => byId.get(fid))
          .filter((f): f is LocationTypeField => !!f);
        qc.setQueryData<LocationTypeField[]>(['location-type-fields', id], reordered);
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(['location-type-fields', id], ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['location-type-fields', id] });
      qc.invalidateQueries({ queryKey: ['location-types', id] });
    },
  });
}

// ---------------------------------------------------------------------------
// Constraints (toegestane ouder-types) — PUT vervangt de hele set
// ---------------------------------------------------------------------------

export function useLocationTypeConstraints(id: string) {
  return useQuery<LocationTypeConstraint[]>({
    queryKey: ['location-type-constraints', id],
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
  return useMutation({
    mutationFn: (constraints: ConstraintInput[]) =>
      apiClient.put<LocationTypeConstraint[]>(`/location-types/${id}/constraints`, { constraints }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['location-type-constraints', id] });
      qc.invalidateQueries({ queryKey: ['location-types', id] });
    },
  });
}

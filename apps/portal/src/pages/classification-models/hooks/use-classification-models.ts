// Hooks-laag voor het classificatiemodellen-domein: lijst (actief + admin) + detail
// + model-CRUD + kenmerken-CRUD/reorder + opties-CRUD/reorder.
// TanStack Query, queryKeys als arrays. Schrijfacties zijn SUPERUSER-only (backend dwingt af).
//
// Het detail (GET /:id) bevat de volledige geneste structuur (characteristics → options),
// dus elke kenmerk-/optie-mutatie invalideert ['classification-models', modelId] zodat de
// detailpagina herlaadt met verse geneste data.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import { classificationModelKeys } from '@/lib/query-keys';
import type { ClassificationModel } from '@/types';

/** Resultaat van een (cascade-)delete: ofwel verwijderd, ofwel een waarschuwing die bevestiging vraagt. */
export interface DeleteResult {
  deleted?: boolean;
  warning?: boolean;
  message?: string;
  affectedTemplates?: number;
}

// ---------------------------------------------------------------------------
// Modellen — lijst + detail + CRUD
// ---------------------------------------------------------------------------

/** Actieve modellen (alle staf mag lezen). */
export function useClassificationModels() {
  return useQuery<ClassificationModel[]>({
    queryKey: classificationModelKeys.all,
    queryFn: () => apiClient.get<ClassificationModel[]>('/classification-models'),
  });
}

/** Alle modellen incl. inactieve (SUPERUSER) — voor de beheer-overzichtspagina. */
export function useClassificationModelsAdmin() {
  return useQuery<ClassificationModel[]>({
    queryKey: classificationModelKeys.admin(),
    queryFn: () => apiClient.get<ClassificationModel[]>('/classification-models/admin'),
  });
}

/** Eén model met geneste kenmerken + opties. */
export function useClassificationModel(id: string) {
  return useQuery<ClassificationModel>({
    queryKey: classificationModelKeys.detail(id),
    queryFn: () => apiClient.get<ClassificationModel>(`/classification-models/${id}`),
    enabled: !!id,
  });
}

export function useCreateClassificationModel() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<ClassificationModel>('/classification-models', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: classificationModelKeys.all }),
  });
}

export function useUpdateClassificationModel() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiClient.patch<ClassificationModel>(`/classification-models/${id}`, data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: classificationModelKeys.all });
      qc.invalidateQueries({ queryKey: classificationModelKeys.detail(v.id) });
    },
  });
}

export function useDeleteClassificationModel() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => apiClient.delete(`/classification-models/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: classificationModelKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Kenmerken (characteristics)
// ---------------------------------------------------------------------------

export function useCreateCharacteristic(modelId: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post(`/classification-models/${modelId}/characteristics`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: classificationModelKeys.detail(modelId) }),
  });
}

export function useUpdateCharacteristic(modelId: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ charId, data }: { charId: string; data: Record<string, unknown> }) =>
      apiClient.patch(`/classification-models/${modelId}/characteristics/${charId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: classificationModelKeys.detail(modelId) }),
  });
}

/**
 * Kenmerk verwijderen. De backend geeft GEEN error bij gebruik door templates, maar
 * `{ warning: true, message, affectedTemplates }` (HTTP 200) zolang `confirm` afwezig is.
 * Roep dan opnieuw aan met `confirm: true` om de cascade te bevestigen.
 */
export function useDeleteCharacteristic(modelId: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ charId, confirm }: { charId: string; confirm?: boolean }) =>
      apiClient.delete<DeleteResult>(
        `/classification-models/${modelId}/characteristics/${charId}${confirm ? '?confirm=true' : ''}`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: classificationModelKeys.detail(modelId) }),
  });
}

/** Kenmerken herordenen — backend verwacht exact de key `characteristicIds`. */
export function useReorderCharacteristics(modelId: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (characteristicIds: string[]) =>
      apiClient.post<ClassificationModel>(
        `/classification-models/${modelId}/characteristics/reorder`,
        { characteristicIds },
      ),
    // Optimistisch: pas de geneste volgorde direct in de detail-cache aan; rollback bij fout.
    onMutate: async (characteristicIds: string[]) => {
      await qc.cancelQueries({ queryKey: classificationModelKeys.detail(modelId) });
      const previous = qc.getQueryData<ClassificationModel>(classificationModelKeys.detail(modelId));
      if (previous?.characteristics) {
        const byId = new Map(previous.characteristics.map((c) => [c.id, c]));
        const reordered = characteristicIds
          .map((id) => byId.get(id))
          .filter((c): c is NonNullable<typeof c> => !!c);
        qc.setQueryData<ClassificationModel>(classificationModelKeys.detail(modelId), {
          ...previous,
          characteristics: reordered,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(classificationModelKeys.detail(modelId), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: classificationModelKeys.detail(modelId) }),
  });
}

// ---------------------------------------------------------------------------
// Opties (options)
// ---------------------------------------------------------------------------

export function useCreateOption(modelId: string, charId: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post(
        `/classification-models/${modelId}/characteristics/${charId}/options`,
        data,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: classificationModelKeys.detail(modelId) }),
  });
}

export function useUpdateOption(modelId: string, charId: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ optionId, data }: { optionId: string; data: Record<string, unknown> }) =>
      apiClient.patch(
        `/classification-models/${modelId}/characteristics/${charId}/options/${optionId}`,
        data,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: classificationModelKeys.detail(modelId) }),
  });
}

/**
 * Optie verwijderen. Net als bij kenmerken: zonder `confirm` kan de backend
 * `{ warning: true, ... }` (HTTP 200) teruggeven; bevestig dan met `confirm: true`.
 */
export function useDeleteOption(modelId: string, charId: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ optionId, confirm }: { optionId: string; confirm?: boolean }) =>
      apiClient.delete<DeleteResult>(
        `/classification-models/${modelId}/characteristics/${charId}/options/${optionId}${confirm ? '?confirm=true' : ''}`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: classificationModelKeys.detail(modelId) }),
  });
}

/** Opties herordenen binnen een kenmerk — backend verwacht exact de key `optionIds`. */
export function useReorderOptions(modelId: string, charId: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (optionIds: string[]) =>
      apiClient.post(
        `/classification-models/${modelId}/characteristics/${charId}/options/reorder`,
        { optionIds },
      ),
    // Optimistisch: herorden de opties binnen dit kenmerk in de detail-cache; rollback bij fout.
    onMutate: async (optionIds: string[]) => {
      await qc.cancelQueries({ queryKey: classificationModelKeys.detail(modelId) });
      const previous = qc.getQueryData<ClassificationModel>(classificationModelKeys.detail(modelId));
      if (previous?.characteristics) {
        const characteristics = previous.characteristics.map((c) => {
          if (c.id !== charId || !c.options) return c;
          const byId = new Map(c.options.map((o) => [o.id, o]));
          const reordered = optionIds
            .map((id) => byId.get(id))
            .filter((o): o is NonNullable<typeof o> => !!o);
          return { ...c, options: reordered };
        });
        qc.setQueryData<ClassificationModel>(classificationModelKeys.detail(modelId), {
          ...previous,
          characteristics,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(classificationModelKeys.detail(modelId), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: classificationModelKeys.detail(modelId) }),
  });
}

// Hooks-laag voor het checklists domein: lijst + detail + lifecycle + item-koppelingen.
// TanStack Query, queryKeys als arrays, mutaties invalideren de relevante keys.
// Spiegelt het asset-types hooks-patroon (use-asset-types.ts).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Checklist, ChecklistItemLink } from '@/types';

interface ListParams {
  status?: string;
  normType?: string;
  assetType?: string;
  locationType?: string;
  includeSystem?: boolean;
}

export function useChecklists(params: ListParams = {}) {
  const qp = new URLSearchParams();
  if (params.status) qp.set('status', params.status);
  if (params.normType) qp.set('normType', params.normType);
  if (params.assetType) qp.set('assetType', params.assetType);
  if (params.locationType) qp.set('locationType', params.locationType);
  if (params.includeSystem) qp.set('includeSystem', 'true');
  const qs = qp.toString();

  return useQuery<Checklist[]>({
    queryKey: ['checklists', params],
    queryFn: () => apiClient.get<Checklist[]>(`/checklists${qs ? `?${qs}` : ''}`),
  });
}

export function useChecklist(id: string) {
  return useQuery<Checklist>({
    queryKey: ['checklists', id],
    queryFn: () => apiClient.get<Checklist>(`/checklists/${id}`),
    enabled: !!id,
  });
}

export function useCreateChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<Checklist>('/checklists', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklists'] }),
  });
}

export function useUpdateChecklist(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.patch<Checklist>(`/checklists/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checklists'] });
      qc.invalidateQueries({ queryKey: ['checklists', id] });
    },
  });
}

export function useDeleteChecklist(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete(`/checklists/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklists'] }),
  });
}

/** Importeren vanuit een JSON-export. Geeft de aangemaakte checklist terug. */
export function useImportChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<Checklist>('/checklists/import', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklists'] }),
  });
}

// ---------------------------------------------------------------------------
// Item-koppelingen (toevoegen / bijwerken / verwijderen / herordenen)
// ---------------------------------------------------------------------------

export interface AddItemInput {
  checklistItemId: string;
  sortOrder?: number;
  isRequired?: boolean;
  categoryOverride?: string;
}

export function useAddChecklistItem(checklistId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AddItemInput) =>
      apiClient.post<ChecklistItemLink>(`/checklists/${checklistId}/items`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklists', checklistId] }),
  });
}

export interface UpdateItemLinkInput {
  sortOrder?: number;
  isRequired?: boolean;
  categoryOverride?: string;
}

export function useUpdateChecklistItemLink(checklistId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ linkId, data }: { linkId: string; data: UpdateItemLinkInput }) =>
      apiClient.patch<ChecklistItemLink>(`/checklists/${checklistId}/items/${linkId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklists', checklistId] }),
  });
}

export function useRemoveChecklistItemLink(checklistId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      apiClient.delete(`/checklists/${checklistId}/items/${linkId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklists', checklistId] }),
  });
}

/** Herorden item-links — backend verwacht exact de key `itemLinkIds`. */
export function useReorderChecklistItems(checklistId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemLinkIds: string[]) =>
      apiClient.post<Checklist>(`/checklists/${checklistId}/items/reorder`, { itemLinkIds }),
    // Optimistic: pas de cache-volgorde direct aan; rollback bij fout.
    onMutate: async (itemLinkIds: string[]) => {
      await qc.cancelQueries({ queryKey: ['checklists', checklistId] });
      const previous = qc.getQueryData<Checklist>(['checklists', checklistId]);
      if (previous?.itemLinks) {
        const byId = new Map(previous.itemLinks.map((l) => [l.id, l]));
        const reordered = itemLinkIds
          .map((lid) => byId.get(lid))
          .filter((l): l is ChecklistItemLink => !!l);
        qc.setQueryData<Checklist>(['checklists', checklistId], {
          ...previous,
          itemLinks: reordered,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(['checklists', checklistId], ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['checklists', checklistId] }),
  });
}

// ---------------------------------------------------------------------------
// Versiebeheer (lifecycle)
// ---------------------------------------------------------------------------

export interface PublishInput {
  changeDescription: string;
  approvalReason?: string;
}

export function usePublishChecklist(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PublishInput) =>
      apiClient.post<Checklist>(`/checklists/${id}/publish`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checklists'] });
      qc.invalidateQueries({ queryKey: ['checklists', id] });
    },
  });
}

export function useRetireChecklist(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PublishInput) =>
      apiClient.post<Checklist>(`/checklists/${id}/retire`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checklists'] });
      qc.invalidateQueries({ queryKey: ['checklists', id] });
    },
  });
}

export function useNewChecklistVersion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { changeDescription?: string }) =>
      apiClient.post<Checklist>(`/checklists/${id}/new-version`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklists'] }),
  });
}

// ---------------------------------------------------------------------------
// Preview + versie-historie
// ---------------------------------------------------------------------------

/** Preview-item zoals geleverd door GET /checklists/:id/preview. */
export interface ChecklistPreviewItem {
  question: string;
  isRequired: boolean;
  normReference?: string;
}

export interface ChecklistPreview {
  id: string;
  name: string;
  version: string;
  status: string;
  totalItems: number;
  requiredItems: number;
  categories: string[];
  itemsByCategory: Record<string, ChecklistPreviewItem[]>;
}

export function useChecklistPreview(id: string) {
  return useQuery<ChecklistPreview>({
    queryKey: ['checklists', id, 'preview'],
    queryFn: () => apiClient.get<ChecklistPreview>(`/checklists/${id}/preview`),
    enabled: !!id,
  });
}

/** Eén versie-historie-regel zoals geleverd door GET /checklists/:id/history. */
export interface ChecklistHistoryEntry {
  id: string;
  checklistId: string;
  fromVersion: string;
  toVersion: string;
  fromStatus: string;
  toStatus: string;
  changeDescription: string;
  approvalReason: string | null;
  changedBy: string;
  changedAt: string;
  snapshot?: Record<string, unknown> | null;
}

export function useChecklistHistory(id: string) {
  return useQuery<ChecklistHistoryEntry[]>({
    queryKey: ['checklists', id, 'history'],
    queryFn: () => apiClient.get<ChecklistHistoryEntry[]>(`/checklists/${id}/history`),
    enabled: !!id,
  });
}

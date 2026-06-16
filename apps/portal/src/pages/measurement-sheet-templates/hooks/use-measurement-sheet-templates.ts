// Hooks-laag voor het meetstaat-templates domein: lijst (FLAT array) + detail + CRUD +
// secties + velden (reorder) + versiebeheer (publish/retire/new-version) + historie.
// TanStack Query, queryKeys als arrays. Structurele wijzigingen (secties/velden) invalideren
// het detail-object ['measurement-sheet-templates', id] dat sections+fields meelevert.
// Alle schrijfacties zijn SUPERUSER-only (backend dwingt dit af).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MeasurementSheetTemplate } from '@/types';

interface ListParams {
  status?: string;
  normType?: string;
  assetType?: string;
}

// ---------------------------------------------------------------------------
// Template (lijst + detail + CRUD)
// ---------------------------------------------------------------------------

export function useMeasurementSheetTemplates(params: ListParams = {}) {
  const qp = new URLSearchParams();
  if (params.status) qp.set('status', params.status);
  if (params.normType) qp.set('normType', params.normType);
  if (params.assetType) qp.set('assetType', params.assetType);
  const qs = qp.toString();

  return useQuery<MeasurementSheetTemplate[]>({
    queryKey: ['measurement-sheet-templates', params],
    queryFn: () =>
      apiClient.get<MeasurementSheetTemplate[]>(
        `/measurement-sheet-templates${qs ? `?${qs}` : ''}`,
      ),
  });
}

/** Detail inclusief sections (met fields). */
export function useMeasurementSheetTemplate(id: string) {
  return useQuery<MeasurementSheetTemplate>({
    queryKey: ['measurement-sheet-templates', id],
    queryFn: () =>
      apiClient.get<MeasurementSheetTemplate>(`/measurement-sheet-templates/${id}`),
    enabled: !!id,
  });
}

/** CREATE-body gebruikt `normType` (NIET normTypeCode) — de RESPONSE gebruikt normTypeCode. */
export function useCreateMeasurementSheetTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<MeasurementSheetTemplate>('/measurement-sheet-templates', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['measurement-sheet-templates'] }),
  });
}

/** PATCH alleen toegestaan in CONCEPT. Partial van create (code immutable, dus niet meesturen). */
export function useUpdateMeasurementSheetTemplate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.patch<MeasurementSheetTemplate>(`/measurement-sheet-templates/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['measurement-sheet-templates'] });
      qc.invalidateQueries({ queryKey: ['measurement-sheet-templates', id] });
    },
  });
}

/** DELETE alleen toegestaan in CONCEPT. */
export function useDeleteMeasurementSheetTemplate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete(`/measurement-sheet-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['measurement-sheet-templates'] }),
  });
}

// ---------------------------------------------------------------------------
// Secties
// ---------------------------------------------------------------------------

/** Helper: refetch zowel het detail-object (heeft sections+fields) als de lijst. */
function invalidateTemplate(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: ['measurement-sheet-templates', id] });
  qc.invalidateQueries({ queryKey: ['measurement-sheet-templates'] });
}

export function useCreateSection(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post(`/measurement-sheet-templates/${id}/sections`, data),
    onSuccess: () => invalidateTemplate(qc, id),
  });
}

export function useUpdateSection(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, data }: { sectionId: string; data: Record<string, unknown> }) =>
      apiClient.patch(`/measurement-sheet-templates/${id}/sections/${sectionId}`, data),
    onSuccess: () => invalidateTemplate(qc, id),
  });
}

export function useDeleteSection(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) =>
      apiClient.delete(`/measurement-sheet-templates/${id}/sections/${sectionId}`),
    onSuccess: () => invalidateTemplate(qc, id),
  });
}

/** Herorden secties — backend verwacht exact de key `sectionIds`. */
export function useReorderSections(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionIds: string[]) =>
      apiClient.post(`/measurement-sheet-templates/${id}/sections/reorder`, { sectionIds }),
    onSuccess: () => invalidateTemplate(qc, id),
  });
}

// ---------------------------------------------------------------------------
// Velden (genest onder een sectie)
// ---------------------------------------------------------------------------

export function useCreateField(id: string, sectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post(
        `/measurement-sheet-templates/${id}/sections/${sectionId}/fields`,
        data,
      ),
    onSuccess: () => invalidateTemplate(qc, id),
  });
}

export function useUpdateField(id: string, sectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldId, data }: { fieldId: string; data: Record<string, unknown> }) =>
      apiClient.patch(
        `/measurement-sheet-templates/${id}/sections/${sectionId}/fields/${fieldId}`,
        data,
      ),
    onSuccess: () => invalidateTemplate(qc, id),
  });
}

export function useDeleteField(id: string, sectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fieldId: string) =>
      apiClient.delete(
        `/measurement-sheet-templates/${id}/sections/${sectionId}/fields/${fieldId}`,
      ),
    onSuccess: () => invalidateTemplate(qc, id),
  });
}

/** Herorden velden binnen een sectie — backend verwacht exact de key `fieldIds`. */
export function useReorderFields(id: string, sectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fieldIds: string[]) =>
      apiClient.post(
        `/measurement-sheet-templates/${id}/sections/${sectionId}/fields/reorder`,
        { fieldIds },
      ),
    onSuccess: () => invalidateTemplate(qc, id),
  });
}

// ---------------------------------------------------------------------------
// Versiebeheer (lifecycle)
// ---------------------------------------------------------------------------

export interface MeasurementSheetTemplateHistoryEntry {
  id: string;
  version: string;
  status: string;
  changeDescription: string | null;
  approvalReason: string | null;
  createdAt: string;
  publishedAt: string | null;
  retiredAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
}

export function useTemplateHistory(id: string) {
  return useQuery<MeasurementSheetTemplateHistoryEntry[]>({
    queryKey: ['measurement-sheet-templates', id, 'history'],
    queryFn: () =>
      apiClient.get<MeasurementSheetTemplateHistoryEntry[]>(
        `/measurement-sheet-templates/${id}/history`,
      ),
    enabled: !!id,
  });
}

/** CONCEPT → ACTIEF. changeDescription verplicht (5-500). */
export function usePublishTemplate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { changeDescription: string; approvalReason?: string }) =>
      apiClient.post<MeasurementSheetTemplate>(
        `/measurement-sheet-templates/${id}/publish`,
        data,
      ),
    onSuccess: () => {
      invalidateTemplate(qc, id);
      qc.invalidateQueries({ queryKey: ['measurement-sheet-templates', id, 'history'] });
    },
  });
}

/** ACTIEF → VERVALLEN. changeDescription verplicht (5-500). */
export function useRetireTemplate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { changeDescription: string; approvalReason?: string }) =>
      apiClient.post<MeasurementSheetTemplate>(
        `/measurement-sheet-templates/${id}/retire`,
        data,
      ),
    onSuccess: () => {
      invalidateTemplate(qc, id);
      qc.invalidateQueries({ queryKey: ['measurement-sheet-templates', id, 'history'] });
    },
  });
}

/** Kloont naar een nieuwe CONCEPT-versie; geeft de nieuwe template terug. */
export function useNewTemplateVersion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { changeDescription?: string }) =>
      apiClient.post<MeasurementSheetTemplate>(
        `/measurement-sheet-templates/${id}/new-version`,
        data,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['measurement-sheet-templates'] }),
  });
}

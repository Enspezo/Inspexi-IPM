// Hooks-laag voor het finding-templates domein: lijst (PAGINATED) + detail + CRUD +
// dupliceren + import/export. TanStack Query, queryKeys als arrays; mutaties invalideren
// ['finding-templates']. Bevat ook een lokale classification-model detail-query voor de
// defaultClassification-editor (geen edit aan de classification-models map).

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import { findingTemplateKeys, classificationModelKeys } from '@/lib/query-keys';
import type { FindingTemplate, ClassificationModel, PaginatedResponse } from '@/types';

interface ListFindingTemplatesParams {
  search?: string;
  categoryId?: string;
  classificationModelId?: string;
  includeSystem?: boolean;
  includeInactive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function useFindingTemplates(params: ListFindingTemplatesParams = {}) {
  const qp = new URLSearchParams();
  if (params.search) qp.set('search', params.search);
  if (params.categoryId) qp.set('categoryId', params.categoryId);
  if (params.classificationModelId) qp.set('classificationModelId', params.classificationModelId);
  if (params.includeSystem) qp.set('includeSystem', 'true');
  if (params.includeInactive) qp.set('includeInactive', 'true');
  if (params.page) qp.set('page', String(params.page));
  if (params.limit) qp.set('limit', String(params.limit));
  if (params.sortBy) qp.set('sortBy', params.sortBy);
  if (params.sortOrder) qp.set('sortOrder', params.sortOrder);
  const qs = qp.toString();

  return useQuery<PaginatedResponse<FindingTemplate>>({
    queryKey: findingTemplateKeys.list(params),
    queryFn: () => apiClient.get<PaginatedResponse<FindingTemplate>>(`/finding-templates${qs ? `?${qs}` : ''}`),
  });
}

// ---------------------------------------------------------------------------
// Detail + CRUD
// ---------------------------------------------------------------------------

export function useFindingTemplate(id: string) {
  return useQuery<FindingTemplate>({
    queryKey: findingTemplateKeys.detail(id),
    queryFn: () => apiClient.get<FindingTemplate>(`/finding-templates/${id}`),
    enabled: !!id,
  });
}

export function useCreateFindingTemplate() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<FindingTemplate>('/finding-templates', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: findingTemplateKeys.all }),
  });
}

export function useUpdateFindingTemplate() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiClient.patch<FindingTemplate>(`/finding-templates/${id}`, data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: findingTemplateKeys.all });
      qc.invalidateQueries({ queryKey: findingTemplateKeys.detail(v.id) });
    },
  });
}

export function useDeleteFindingTemplate() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => apiClient.delete(`/finding-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: findingTemplateKeys.all }),
  });
}

/** Systeem→org kopie; body { code? }; geeft de nieuwe template terug. */
export function useDuplicateFindingTemplate() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, code }: { id: string; code?: string }) =>
      apiClient.post<FindingTemplate>(`/finding-templates/${id}/duplicate`, code ? { code } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: findingTemplateKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Import / Export
// ---------------------------------------------------------------------------

/** Eén geëxporteerd sjabloon (categorie/model op naam/code i.p.v. UUID). */
export interface FindingTemplateExportItem {
  code?: string;
  category?: string;
  shortDescription: string;
  longDescription?: string;
  explanation?: string;
  normReference?: string;
  classificationModelCode?: string;
  defaultClassification?: Record<string, string>;
}

/** Export-formaat zoals de backend dit teruggeeft (na apiClient unwrap van { success, data }). */
export interface FindingTemplateExport {
  exportVersion: string;
  exportedAt: string;
  exportedBy: string;
  findingTemplates: FindingTemplateExportItem[];
}

/** Resultaat van een import-actie. */
export interface ImportFindingTemplatesResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/** Importpayload: exportVersion + lijst sjablonen (classificationModelCode verplicht per item). */
export interface ImportFindingTemplatesPayload {
  exportVersion: string;
  findingTemplates: FindingTemplateExportItem[];
}

export function useImportFindingTemplates() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (payload: ImportFindingTemplatesPayload) =>
      apiClient.post<ImportFindingTemplatesResult>('/finding-templates/import', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: findingTemplateKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Classification-model detail (lokaal — geen edit aan de classification-models map)
// ---------------------------------------------------------------------------

/** Detail van een classificatiemodel inclusief characteristics + options. */
export function useClassificationModelDetail(id: string | null | undefined) {
  return useQuery<ClassificationModel>({
    queryKey: classificationModelKeys.detail(id as string),
    queryFn: () => apiClient.get<ClassificationModel>(`/classification-models/${id}`),
    enabled: !!id,
  });
}

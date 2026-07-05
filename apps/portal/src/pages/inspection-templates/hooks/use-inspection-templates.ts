import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { inspectionTemplateKeys, inspectionTemplateKeys1 } from '@/lib/query-keys';
import type { InspectionTemplate } from '@/types';

interface ListParams {
  status?: string;
  normType?: string;
  includeSystem?: boolean;
  search?: string;
}

/** Body voor het aanmaken van een eigen (org-)inspectie-template. */
export interface CreateInspectionTemplateInput {
  code: string;
  name: string;
  description?: string;
  normTypeCode: string;
  classificationModelId: string;
}

/** Optionele overrides bij het forken van een systeemtemplate. */
export interface ForkInspectionTemplateInput {
  code?: string;
  name?: string;
}

/** Bewerkbare velden van een inspectie-template (alleen CONCEPT). */
export interface UpdateInspectionTemplateInput {
  name?: string;
  description?: string;
  classificationModelId?: string;
}

/** Detail van één inspectie-template. */
export function useInspectionTemplate(id: string) {
  return useQuery<InspectionTemplate>({
    queryKey: inspectionTemplateKeys1.detail(id),
    queryFn: () => apiClient.get<InspectionTemplate>(`/inspection-templates/${id}`),
    enabled: !!id,
  });
}

export function useInspectionTemplates(params: ListParams = {}) {
  const qp = new URLSearchParams();
  if (params.status) qp.set('status', params.status);
  if (params.normType) qp.set('normType', params.normType);
  if (params.includeSystem) qp.set('includeSystem', 'true');
  if (params.search) qp.set('search', params.search);
  const qs = qp.toString();

  return useQuery<InspectionTemplate[]>({
    queryKey: inspectionTemplateKeys.list(params),
    queryFn: () => apiClient.get<InspectionTemplate[]>(`/inspection-templates${qs ? `?${qs}` : ''}`),
  });
}

/** Nieuwe eigen inspectie-template aanmaken (CONCEPT). */
export function useCreateInspectionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInspectionTemplateInput) =>
      apiClient.post<InspectionTemplate>('/inspection-templates', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: inspectionTemplateKeys.all }),
  });
}

/** Inspectie-template bijwerken (alleen CONCEPT: naam/omschrijving/classificatiemodel). */
export function useUpdateInspectionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateInspectionTemplateInput }) =>
      apiClient.patch<InspectionTemplate>(`/inspection-templates/${id}`, data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: inspectionTemplateKeys.all });
      qc.invalidateQueries({ queryKey: inspectionTemplateKeys1.detail(v.id) });
    },
  });
}

/** Systeemtemplate forken naar de eigen organisatie (als CONCEPT). */
export function useForkInspectionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ForkInspectionTemplateInput }) =>
      apiClient.post<InspectionTemplate>(`/inspection-templates/${id}/fork`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: inspectionTemplateKeys.all }),
  });
}

/** Inspectie-template verwijderen (alleen CONCEPT). */
export function useDeleteInspectionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/inspection-templates/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: inspectionTemplateKeys.all });
      qc.invalidateQueries({ queryKey: inspectionTemplateKeys1.detail(id) });
    },
  });
}

/** Publiceren (CONCEPT → ACTIEF), met optionele toelichting voor de historie. */
export function usePublishInspectionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changeDescription }: { id: string; changeDescription?: string }) =>
      apiClient.post<InspectionTemplate>(`/inspection-templates/${id}/publish`, { changeDescription }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: inspectionTemplateKeys.all });
      qc.invalidateQueries({ queryKey: inspectionTemplateKeys1.detail(v.id) });
    },
  });
}

/** Laten vervallen (ACTIEF → VERVALLEN), met optionele reden voor de historie. */
export function useRetireInspectionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiClient.post<InspectionTemplate>(`/inspection-templates/${id}/retire`, { reason }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: inspectionTemplateKeys.all });
      qc.invalidateQueries({ queryKey: inspectionTemplateKeys1.detail(v.id) });
    },
  });
}

/** Nieuwe versie maken (kloon naar CONCEPT, versie opgehoogd). */
export function useNewVersionInspectionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changeDescription }: { id: string; changeDescription?: string }) =>
      apiClient.post<InspectionTemplate>(`/inspection-templates/${id}/new-version`, {
        changeDescription,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: inspectionTemplateKeys.all }),
  });
}

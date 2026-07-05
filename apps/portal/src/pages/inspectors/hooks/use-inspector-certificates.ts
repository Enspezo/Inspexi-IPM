import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { inspectorCertificateKeys } from '@/lib/query-keys';
import type { InspectorCertificate, PaginatedResponse } from '@/types';

/** Velden van het toevoeg-/bewerk-formulier (datums als ISO yyyy-MM-dd strings). */
export interface CertificateFormValues {
  type: string;
  number?: string;
  issueDate: string;
  validUntil?: string;
  issuer: string;
  file?: File | null;
}

function toFormData(values: CertificateFormValues, userId?: string): FormData {
  const fd = new FormData();
  if (userId) fd.append('userId', userId);
  fd.append('type', values.type);
  fd.append('number', values.number ?? '');
  fd.append('issueDate', values.issueDate);
  fd.append('validUntil', values.validUntil ?? '');
  fd.append('issuer', values.issuer);
  if (values.file) fd.append('file', values.file);
  return fd;
}

/** Certificaten van één inspecteur (of — voor management zonder userId — van alle inspecteurs). */
export function useInspectorCertificates(params: { userId?: string } = {}) {
  const qs = new URLSearchParams({ limit: '100' });
  if (params.userId) qs.set('userId', params.userId);
  return useQuery<PaginatedResponse<InspectorCertificate>>({
    queryKey: inspectorCertificateKeys.list(params.userId ?? 'all'),
    queryFn: () => apiClient.get<PaginatedResponse<InspectorCertificate>>(`/inspector-certificates?${qs.toString()}`),
  });
}

export function useInspectorCertificate(id: string | undefined) {
  return useQuery<InspectorCertificate>({
    queryKey: inspectorCertificateKeys.detail(id as string),
    queryFn: () => apiClient.get<InspectorCertificate>(`/inspector-certificates/${id}`),
    enabled: !!id,
  });
}

/** Distinct autocomplete-waarden voor "Soort" (type) of "Instantie" (issuer). */
export function useCertificateSuggestions(field: 'type' | 'issuer') {
  return useQuery<string[]>({
    queryKey: inspectorCertificateKeys.suggestions(field),
    queryFn: () => apiClient.get<string[]>(`/inspector-certificates/suggestions?field=${field}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateInspectorCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, values }: { userId: string; values: CertificateFormValues }) =>
      apiClient.upload<InspectorCertificate>('/inspector-certificates', toFormData(values, userId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: inspectorCertificateKeys.all }),
  });
}

export function useUpdateInspectorCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: CertificateFormValues }) =>
      apiClient.upload<InspectorCertificate>(`/inspector-certificates/${id}`, toFormData(values), 'PATCH'),
    onSuccess: () => qc.invalidateQueries({ queryKey: inspectorCertificateKeys.all }),
  });
}

export function useDeleteInspectorCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/inspector-certificates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: inspectorCertificateKeys.all }),
  });
}

/** Alleen het gekoppelde bestand verwijderen; het certificaat blijft bestaan. */
export function useDeleteCertificateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<InspectorCertificate>(`/inspector-certificates/${id}/document`),
    onSuccess: () => qc.invalidateQueries({ queryKey: inspectorCertificateKeys.all }),
  });
}

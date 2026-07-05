/**
 * Hooks + helpers voor gegenereerde inspectie-documenten (plan/rapport).
 * Backend: generated-documents.controller.
 *   POST   /inspection-plans/:planId/generate-plan | generate-report
 *   GET    /inspection-plans/:planId/documents
 *   POST   /generated-documents/:id/export-pdf | export-word
 *   POST   /generated-documents/:id/preview        (PDF-stream, niet opgeslagen)
 *   GET    /generated-documents/:id/download?format=pdf|word
 *   POST   /generated-documents/:id/finalize
 *   POST   /generated-documents/:id/request-signature
 *   DELETE /generated-documents/:id
 *
 * Blob-endpoints (preview/download) gaan via een ruwe auth-fetch i.p.v. apiClient,
 * omdat apiClient de JSON-`{ success, data }`-envelope verwacht.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, getAccessToken } from '@/lib/api-client';
import { inspectionDocumentKeys } from '@/lib/query-keys';
import { DocumentType } from '@/types';
import type { GeneratedDocument, DocumentSignature } from '@/types';

const API_BASE = '/api/v1';

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useInspectionDocuments(planId: string | undefined) {
  return useQuery<GeneratedDocument[]>({
    queryKey: inspectionDocumentKeys.byPlan(planId ?? ''),
    queryFn: () => apiClient.get<GeneratedDocument[]>(`/inspection-plans/${planId}/documents`),
    enabled: !!planId,
  });
}

export function useGenerateDocument(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentType: DocumentType) => {
      const endpoint = documentType === DocumentType.PLAN ? 'generate-plan' : 'generate-report';
      return apiClient.post<GeneratedDocument>(`/inspection-plans/${planId}/${endpoint}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: inspectionDocumentKeys.byPlan(planId) }),
  });
}

export function useExportDocumentPdf(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ pdfUrl: string }>(`/generated-documents/${id}/export-pdf`),
    onSuccess: () => qc.invalidateQueries({ queryKey: inspectionDocumentKeys.byPlan(planId) }),
  });
}

export function useExportDocumentWord(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ wordUrl: string }>(`/generated-documents/${id}/export-word`),
    onSuccess: () => qc.invalidateQueries({ queryKey: inspectionDocumentKeys.byPlan(planId) }),
  });
}

export function useFinalizeDocument(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<GeneratedDocument>(`/generated-documents/${id}/finalize`),
    onSuccess: () => qc.invalidateQueries({ queryKey: inspectionDocumentKeys.byPlan(planId) }),
  });
}

export function useDeleteDocument(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/generated-documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: inspectionDocumentKeys.byPlan(planId) }),
  });
}

export interface RequestSignatureInput {
  signerRoleCode: string;
  signerName: string;
  signerEmail: string;
  signerFunction?: string;
}

export function useRequestSignature(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RequestSignatureInput }) =>
      apiClient.post<DocumentSignature>(`/generated-documents/${id}/request-signature`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: inspectionDocumentKeys.byPlan(planId) }),
  });
}

// ── Blob-helpers (ruwe auth-fetch) ──────────────────────────
/** PDF-preview (niet opgeslagen) → tijdelijke blob-URL voor een <iframe>. */
export async function previewDocumentPdf(id: string): Promise<string> {
  const res = await fetch(`${API_BASE}/generated-documents/${id}/preview`, {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Preview kon niet worden gegenereerd');
  return URL.createObjectURL(await res.blob());
}

/** Geëxporteerd bestand downloaden (de route exporteert on-demand als de key ontbreekt). */
export async function downloadDocument(
  id: string,
  format: 'pdf' | 'word',
  filename: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/generated-documents/${id}/download?format=${format}`, {
    headers: authHeaders(),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Download mislukt');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

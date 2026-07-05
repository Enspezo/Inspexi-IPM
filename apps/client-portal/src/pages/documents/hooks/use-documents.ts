import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  clientDocumentKeys,
  clientInspectionDocumentKeys,
  clientInspectionDetailKeys,
  clientDashboardKeys,
} from '@/lib/query-keys';
import type { DocumentDetail, SignResult } from '@/types';

export function useDocument(id: string | undefined) {
  return useQuery<DocumentDetail>({
    queryKey: clientDocumentKeys.detail(id as string),
    queryFn: () => apiClient.get<DocumentDetail>(`/client/documents/${id}`),
    enabled: !!id,
  });
}

export function useSignDocument(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { signatureImage: string; signerName?: string }) =>
      apiClient.post<SignResult>(`/client/documents/${documentId}/sign`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientDocumentKeys.detail(documentId) });
      qc.invalidateQueries({ queryKey: clientInspectionDocumentKeys.all });
      qc.invalidateQueries({ queryKey: clientInspectionDetailKeys.all });
      qc.invalidateQueries({ queryKey: clientDashboardKeys.all });
    },
  });
}

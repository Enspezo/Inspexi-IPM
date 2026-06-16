import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { DocumentDetail, SignResult } from '@/types';

export function useDocument(id: string | undefined) {
  return useQuery<DocumentDetail>({
    queryKey: ['client-document', id],
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
      qc.invalidateQueries({ queryKey: ['client-document', documentId] });
      qc.invalidateQueries({ queryKey: ['client-inspection-documents'] });
      qc.invalidateQueries({ queryKey: ['client-inspection'] });
      qc.invalidateQueries({ queryKey: ['client-dashboard'] });
    },
  });
}

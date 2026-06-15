import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { InspectionMessage } from '@/types';

export function useMessages(inspectionId: string | undefined) {
  return useQuery<InspectionMessage[]>({
    queryKey: ['client-messages', inspectionId],
    queryFn: () => apiClient.get<InspectionMessage[]>(`/client/inspections/${inspectionId}/messages`),
    enabled: !!inspectionId,
    refetchInterval: 15000, // lichte polling voor nieuwe staf-berichten
  });
}

export function useSendMessage(inspectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiClient.post(`/client/inspections/${inspectionId}/messages`, { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-messages', inspectionId] }),
  });
}

export function useMarkMessageRead(inspectionId: string) {
  return useMutation({
    mutationFn: (messageId: string) =>
      apiClient.post(`/client/inspections/${inspectionId}/messages/${messageId}/read`),
  });
}

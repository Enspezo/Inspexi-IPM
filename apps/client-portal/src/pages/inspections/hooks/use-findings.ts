import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { FindingDetail } from '@/types';

export function useFinding(id: string | undefined) {
  return useQuery<FindingDetail>({
    queryKey: ['client-finding', id],
    queryFn: () => apiClient.get<FindingDetail>(`/client/findings/${id}`),
    enabled: !!id,
  });
}

/** Meldt de constatering als opgelost (FindingResolution) + uploadt optioneel foto's bij de resolutie. */
export function useResolveFinding(findingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ description, files }: { description?: string; files: File[] }) => {
      await apiClient.post(`/client/findings/${findingId}/resolve`, {
        description: description?.trim() || undefined,
      });
      if (files.length > 0) {
        const formData = new FormData();
        files.forEach((file) => formData.append('photos', file));
        await apiClient.upload(`/client/findings/${findingId}/resolve/photos`, formData);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-finding', findingId] });
      qc.invalidateQueries({ queryKey: ['client-inspection-findings'] });
      qc.invalidateQueries({ queryKey: ['client-inspection'] });
      qc.invalidateQueries({ queryKey: ['client-dashboard'] });
    },
  });
}

/** Trekt de eigen, nog niet geverifieerde resolutie terug. */
export function useDeleteResolution(findingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete(`/client/findings/${findingId}/resolve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-finding', findingId] });
      qc.invalidateQueries({ queryKey: ['client-inspection-findings'] });
      qc.invalidateQueries({ queryKey: ['client-inspection'] });
      qc.invalidateQueries({ queryKey: ['client-dashboard'] });
    },
  });
}

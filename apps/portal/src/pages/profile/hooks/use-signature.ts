import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { UserSignature } from '@/types';

export function useSignature() {
  return useQuery<UserSignature>({
    queryKey: ['signature'],
    queryFn: () => apiClient.get<UserSignature>('/users/me/signature'),
  });
}

export function useSaveSignature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { signatureType: string; signatureData: string }) =>
      apiClient.patch<UserSignature>('/users/me/signature', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signature'] });
    },
  });
}

export function useDeleteSignature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.delete('/users/me/signature'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signature'] });
    },
  });
}

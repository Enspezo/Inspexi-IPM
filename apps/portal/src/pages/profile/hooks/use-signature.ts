import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { UserSignature } from '@/types';
import { signatureKeys } from '@/lib/query-keys';

export function useSignature() {
  return useQuery<UserSignature>({
    queryKey: signatureKeys.all,
    queryFn: () => apiClient.get<UserSignature>('/users/me/signature'),
  });
}

export function useSaveSignature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { signatureType: string; signatureData: string }) =>
      apiClient.patch<UserSignature>('/users/me/signature', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: signatureKeys.all });
    },
  });
}

export function useDeleteSignature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.delete('/users/me/signature'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: signatureKeys.all });
    },
  });
}

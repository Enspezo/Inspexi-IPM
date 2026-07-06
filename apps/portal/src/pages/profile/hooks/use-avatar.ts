import { useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import { profileKeys, meKeys } from '@/lib/query-keys';

export function useUploadAvatar() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.upload<{ storageKey: string }>('/users/me/avatar', formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all });
      queryClient.invalidateQueries({ queryKey: meKeys.all });
    },
  });
}

export function useDeleteAvatar() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: () => apiClient.delete('/users/me/avatar'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all });
      queryClient.invalidateQueries({ queryKey: meKeys.all });
    },
  });
}

/** Returns the authenticated avatar URL for the current user. */
export function getAvatarUrl(): string {
  return '/api/v1/users/me/avatar';
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ContactLog } from '@/types';

interface CreateLogDto {
  type: string;
  subject?: string;
  body?: string;
  loggedAt?: string;
}

export function useAddLog(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLogDto) =>
      apiClient.post<ContactLog>(`/contacts/${contactId}/logs`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', contactId] });
      queryClient.invalidateQueries({
        queryKey: ['contacts', contactId, 'logs'],
      });
    },
  });
}

export function useContactLogs(contactId: string) {
  return useQuery<ContactLog[]>({
    queryKey: ['contacts', contactId, 'logs'],
    queryFn: () =>
      apiClient.get<ContactLog[]>(`/contacts/${contactId}/logs`),
    enabled: !!contactId,
  });
}

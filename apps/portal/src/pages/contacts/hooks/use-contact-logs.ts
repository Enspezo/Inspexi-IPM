import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import { contactKeys } from '@/lib/query-keys';
import type { ContactLog } from '@/types';

interface CreateLogDto {
  type: string;
  subject?: string;
  body?: string;
  loggedAt?: string;
}

export function useAddLog(contactId: string) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (data: CreateLogDto) =>
      apiClient.post<ContactLog>(`/contacts/${contactId}/logs`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(contactId) });
      queryClient.invalidateQueries({
        queryKey: contactKeys.logs(contactId),
      });
    },
  });
}

export function useContactLogs(contactId: string) {
  return useQuery<ContactLog[]>({
    queryKey: contactKeys.logs(contactId),
    queryFn: () =>
      apiClient.get<ContactLog[]>(`/contacts/${contactId}/logs`),
    enabled: !!contactId,
  });
}

import { useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import { contactKeys } from '@/lib/query-keys';
import type { ContactEmail } from '@/types';

interface SendEmailDto {
  subject: string;
  bodyHtml: string;
}

export function useSendEmail(contactId: string) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (data: SendEmailDto) =>
      apiClient.post<ContactEmail>(`/contacts/${contactId}/email`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(contactId) });
    },
  });
}

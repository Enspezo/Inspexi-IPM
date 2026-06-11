import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ContactEmail } from '@/types';

interface SendEmailDto {
  subject: string;
  bodyHtml: string;
}

export function useSendEmail(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendEmailDto) =>
      apiClient.post<ContactEmail>(`/contacts/${contactId}/email`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', contactId] });
    },
  });
}

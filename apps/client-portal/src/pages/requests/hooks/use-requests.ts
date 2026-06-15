import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ClientRequest, ClientMe } from '@/types';

export function useRequests() {
  return useQuery<ClientRequest[]>({
    queryKey: ['client-requests'],
    queryFn: () => apiClient.get<ClientRequest[]>('/client/requests'),
  });
}

export function useRequest(id: string | undefined) {
  return useQuery<ClientRequest>({
    queryKey: ['client-request', id],
    queryFn: () => apiClient.get<ClientRequest>(`/client/requests/${id}`),
    enabled: !!id,
  });
}

/** Toegangslijst van de klant binnen deze org (voor de contact-keuze bij een nieuwe opdracht). */
export function useClientMe() {
  return useQuery<ClientMe>({
    queryKey: ['client-me'],
    queryFn: () => apiClient.get<ClientMe>('/client/auth/me'),
  });
}

export function useCreateReinspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { inspectionPlanId: string; description: string; preferredDate?: string }) =>
      apiClient.post<ClientRequest>('/client/requests/reinspection', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-requests'] }),
  });
}

export function useCreateNewAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      contactId: string;
      subject: string;
      description: string;
      preferredDate?: string;
    }) => apiClient.post<ClientRequest>('/client/requests/new-assignment', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-requests'] }),
  });
}

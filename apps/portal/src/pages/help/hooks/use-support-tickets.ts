import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  SupportTicket,
  SupportTicketMessage,
  SupportTicketStatus,
  SupportTicketPriority,
  PaginatedResponse,
} from '@/types';
import { supportTicketKeys } from '@/lib/query-keys';

interface TicketListParams {
  scope?: 'mine' | 'org';
  /** Alleen voor SUPERUSER: filter de wachtrij op één organisatie. */
  orgId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

interface CreateTicketInput {
  subject: string;
  description: string;
  category?: string;
  priority?: string;
  contextModule?: string;
  contextUrl?: string;
}

interface UpdateTicketInput {
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  assignedToId?: string | null;
}

export function useSupportTickets(params: TicketListParams = {}) {
  const q = new URLSearchParams();
  if (params.scope) q.set('scope', params.scope);
  if (params.orgId) q.set('orgId', params.orgId);
  if (params.status) q.set('status', params.status);
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  const qs = q.toString();
  return useQuery<PaginatedResponse<SupportTicket>>({
    queryKey: supportTicketKeys.list(params),
    queryFn: () =>
      apiClient.get<PaginatedResponse<SupportTicket>>(
        `/support-tickets${qs ? `?${qs}` : ''}`,
      ),
  });
}

export function useSupportTicket(id: string) {
  return useQuery<SupportTicket>({
    queryKey: supportTicketKeys.detail(id),
    queryFn: () => apiClient.get<SupportTicket>(`/support-tickets/${id}`),
    enabled: !!id,
  });
}

export function useTicketStats() {
  return useQuery<Record<string, number>>({
    queryKey: supportTicketKeys.stats(),
    queryFn: () => apiClient.get<Record<string, number>>('/support-tickets/stats'),
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTicketInput) =>
      apiClient.post<SupportTicket>('/support-tickets', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: supportTicketKeys.all }),
  });
}

export function useAddTicketMessage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { body: string; isInternal?: boolean }) =>
      apiClient.post<SupportTicketMessage>(`/support-tickets/${id}/messages`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: supportTicketKeys.detail(id) });
      qc.invalidateQueries({ queryKey: supportTicketKeys.lists() });
    },
  });
}

export function useUpdateTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateTicketInput) =>
      apiClient.patch<SupportTicket>(`/support-tickets/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: supportTicketKeys.lists() });
      qc.invalidateQueries({ queryKey: supportTicketKeys.detail(id) });
    },
  });
}

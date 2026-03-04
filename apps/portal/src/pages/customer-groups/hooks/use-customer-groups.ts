import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { CustomerGroup, PaginatedResponse } from '@/types';

interface ListParams {
  search?: string;
  page?: number;
  limit?: number;
}

export function useCustomerGroups(params: ListParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));

  const qs = queryParams.toString();
  const endpoint = `/customer-groups${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<CustomerGroup>>({
    queryKey: ['customer-groups', params],
    queryFn: () => apiClient.get<PaginatedResponse<CustomerGroup>>(endpoint),
  });
}

export function useCustomerGroupsCompact() {
  return useQuery<{ id: string; name: string }[]>({
    queryKey: ['customer-groups', 'compact'],
    queryFn: () =>
      apiClient.get<{ id: string; name: string }[]>(
        '/customer-groups/compact',
      ),
    staleTime: 30 * 60 * 1000, // 30 min — dropdown options, admin-only changes
  });
}

export function useCustomerGroup(id: string) {
  return useQuery<CustomerGroup>({
    queryKey: ['customer-groups', id],
    queryFn: () => apiClient.get<CustomerGroup>(`/customer-groups/${id}`),
    enabled: !!id,
  });
}

interface CreateDto {
  name: string;
  notes?: string;
}

export function useCreateCustomerGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDto) =>
      apiClient.post<CustomerGroup>('/customer-groups', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-groups'] });
    },
  });
}

export function useUpdateCustomerGroup(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<CreateDto>) =>
      apiClient.patch<CustomerGroup>(`/customer-groups/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-groups'] });
    },
  });
}

export function useDeleteCustomerGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/customer-groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-groups'] });
    },
  });
}

// ─── Contact toewijzing aan groep ─────────────────────

export function useAddContactToGroup(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contactId: string) =>
      apiClient.post<CustomerGroup>(`/customer-groups/${groupId}/contacts`, {
        contactId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-groups', groupId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useRemoveContactFromGroup(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contactId: string) =>
      apiClient.delete<CustomerGroup>(
        `/customer-groups/${groupId}/contacts/${contactId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-groups', groupId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

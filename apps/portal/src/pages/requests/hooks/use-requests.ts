import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import {
  lostReasonKeys,
  requestKeys,
  requestsAllKeys,
  userKeys,
} from '@/lib/query-keys';
import type {
  Request,
  PaginatedResponse,
  RequestStatus,
  Priority,
  UserSummary,
  LostReason,
} from '@/types';

/** Lookup: actieve "reden verloren" opties (globaal + org-specifiek). */
export function useLostReasons() {
  return useQuery<LostReason[]>({
    queryKey: lostReasonKeys.all,
    queryFn: () => apiClient.get<LostReason[]>('/requests/lost-reasons'),
    staleTime: 5 * 60 * 1000,
  });
}

interface ListRequestsParams {
  search?: string;
  status?: RequestStatus;
  priority?: Priority;
  assignedTo?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  enabled?: boolean;
}

export function useRequests(params: ListRequestsParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.status) queryParams.set('status', params.status);
  if (params.priority) queryParams.set('priority', params.priority);
  if (params.assignedTo) queryParams.set('assignedTo', params.assignedTo);
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));
  if (params.sortBy) queryParams.set('sortBy', params.sortBy);
  if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);

  const qs = queryParams.toString();
  const endpoint = `/requests${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<Request>>({
    queryKey: requestKeys.list(params),
    queryFn: () => apiClient.get<PaginatedResponse<Request>>(endpoint),
    enabled: params.enabled,
  });
}

export function useRequest(id: string) {
  return useQuery<Request>({
    queryKey: requestKeys.detail(id),
    queryFn: () => apiClient.get<Request>(`/requests/${id}`),
    enabled: !!id,
  });
}

interface CreateRequestDto {
  contactId: string;
  requestNumber?: string;
  locationId?: string;
  assignedTo?: string;
  source: string;
  title: string;
  description?: string;
  priority?: string;
}

export function useCreateRequest() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (data: CreateRequestDto) =>
      apiClient.post<Request>('/requests', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: requestKeys.all });
    },
  });
}

interface UpdateRequestDto {
  title?: string;
  description?: string;
  contactId?: string;
  locationId?: string;
  assignedTo?: string;
  source?: string;
  priority?: string;
}

export function useUpdateRequest(id: string) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (data: UpdateRequestDto) =>
      apiClient.patch<Request>(`/requests/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: requestKeys.all });
    },
  });
}

interface UpdateRequestStatusDto {
  status: string;
  note?: string;
}

export function useUpdateRequestStatus(id: string) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (data: UpdateRequestStatusDto) =>
      apiClient.patch<Request>(`/requests/${id}/status`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: requestKeys.all });
    },
  });
}

export function useDeleteRequest() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (id: string) => apiClient.delete(`/requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: requestKeys.all });
    },
  });
}

export function useOrgUsers() {
  return useQuery<UserSummary[]>({
    queryKey: userKeys.org(),
    queryFn: () => apiClient.get<UserSummary[]>('/users'),
  });
}

/** Haalt alle aanvragen op zonder paginering, voor de kanban-weergave */
export function useAllRequests(params: Omit<ListRequestsParams, 'page' | 'limit'> = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.status) queryParams.set('status', params.status);
  if (params.priority) queryParams.set('priority', params.priority);
  if (params.assignedTo) queryParams.set('assignedTo', params.assignedTo);
  queryParams.set('limit', '500');

  const qs = queryParams.toString();
  const endpoint = `/requests${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<Request>>({
    queryKey: requestsAllKeys.list(params),
    queryFn: () => apiClient.get<PaginatedResponse<Request>>(endpoint),
  });
}

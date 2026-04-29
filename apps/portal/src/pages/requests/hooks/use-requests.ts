import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  Request,
  PaginatedResponse,
  RequestStatus,
  Priority,
  UserSummary,
} from '@/types';

interface ListRequestsParams {
  search?: string;
  status?: RequestStatus;
  priority?: Priority;
  assignedTo?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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
    queryKey: ['requests', params],
    queryFn: () => apiClient.get<PaginatedResponse<Request>>(endpoint),
  });
}

export function useRequest(id: string) {
  return useQuery<Request>({
    queryKey: ['requests', id],
    queryFn: () => apiClient.get<Request>(`/requests/${id}`),
    enabled: !!id,
  });
}

interface CreateRequestDto {
  contactId: string;
  locationId?: string;
  assignedTo?: string;
  source: string;
  title: string;
  description?: string;
  priority?: string;
}

export function useCreateRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRequestDto) =>
      apiClient.post<Request>('/requests', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
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

  return useMutation({
    mutationFn: (data: UpdateRequestDto) =>
      apiClient.patch<Request>(`/requests/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

interface UpdateRequestStatusDto {
  status: string;
  note?: string;
}

export function useUpdateRequestStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateRequestStatusDto) =>
      apiClient.patch<Request>(`/requests/${id}/status`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

export function useDeleteRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

export function useOrgUsers() {
  return useQuery<UserSummary[]>({
    queryKey: ['users', 'org'],
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
    queryKey: ['requests-all', params],
    queryFn: () => apiClient.get<PaginatedResponse<Request>>(endpoint),
  });
}

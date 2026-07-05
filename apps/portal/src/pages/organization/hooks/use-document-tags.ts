import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { documentTagKeys, documentKeys } from '@/lib/query-keys';
import type { DocumentTag, DocumentTagRef, PaginatedResponse } from '@/types';

interface ListParams {
  search?: string;
  page?: number;
  limit?: number;
}

export function useDocumentTags(params: ListParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));

  const qs = queryParams.toString();
  const endpoint = `/document-tags${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<DocumentTag>>({
    queryKey: documentTagKeys.list(params),
    queryFn: () => apiClient.get<PaginatedResponse<DocumentTag>>(endpoint),
  });
}

/** Compacte tag-lijst voor pickers (upload / document bewerken). */
export function useDocumentTagsCompact() {
  return useQuery<DocumentTagRef[]>({
    queryKey: documentTagKeys.compact(),
    queryFn: () => apiClient.get<DocumentTagRef[]>('/document-tags/compact'),
    staleTime: 5 * 60 * 1000,
  });
}

interface CreateDto {
  name: string;
  color: string;
  sortOrder?: number;
}

export function useCreateDocumentTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDto) =>
      apiClient.post<DocumentTag>('/document-tags', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentTagKeys.all });
    },
  });
}

export function useUpdateDocumentTag(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateDto>) =>
      apiClient.patch<DocumentTag>(`/document-tags/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentTagKeys.all });
    },
  });
}

export function useDeleteDocumentTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/document-tags/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentTagKeys.all });
      // Tag verdwijnt van documenten → herlaad documentenlijsten
      queryClient.invalidateQueries({ queryKey: documentKeys.all });
    },
  });
}

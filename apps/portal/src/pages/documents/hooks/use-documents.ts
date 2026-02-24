import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  CrmDocument,
  PaginatedResponse,
  DocumentEntityType,
} from '@/types';

interface ListDocumentsParams {
  search?: string;
  entityType?: DocumentEntityType;
  entityId?: string;
  onlyMine?: boolean;
  page?: number;
  limit?: number;
}

export function useDocuments(params: ListDocumentsParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.entityType) queryParams.set('entityType', params.entityType);
  if (params.entityId) queryParams.set('entityId', params.entityId);
  if (params.onlyMine) queryParams.set('onlyMine', 'true');
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));

  const qs = queryParams.toString();
  const endpoint = `/documents${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<CrmDocument>>({
    queryKey: ['documents', params],
    queryFn: () => apiClient.get<PaginatedResponse<CrmDocument>>(endpoint),
  });
}

export function useEntityDocuments(
  entityType: DocumentEntityType,
  entityId: string,
) {
  return useDocuments({ entityType, entityId, limit: 100 });
}

interface UploadDocumentData {
  file: File;
  entityType: DocumentEntityType;
  entityId: string;
  description?: string;
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UploadDocumentData) => {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('entityType', data.entityType);
      formData.append('entityId', data.entityId);
      if (data.description) formData.append('description', data.description);
      return apiClient.upload<CrmDocument>('/documents', formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

interface UpdateDocumentData {
  description?: string;
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDocumentData }) =>
      apiClient.patch<CrmDocument>(`/documents/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/documents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

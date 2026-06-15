import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { FindingTemplate, PaginatedResponse } from '@/types';

interface ListFindingTemplatesParams {
  search?: string;
  categoryId?: string;
  classificationModelId?: string;
  includeSystem?: boolean;
  includeInactive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function useFindingTemplates(params: ListFindingTemplatesParams = {}) {
  const qp = new URLSearchParams();
  if (params.search) qp.set('search', params.search);
  if (params.categoryId) qp.set('categoryId', params.categoryId);
  if (params.classificationModelId) qp.set('classificationModelId', params.classificationModelId);
  if (params.includeSystem) qp.set('includeSystem', 'true');
  if (params.includeInactive) qp.set('includeInactive', 'true');
  if (params.page) qp.set('page', String(params.page));
  if (params.limit) qp.set('limit', String(params.limit));
  if (params.sortBy) qp.set('sortBy', params.sortBy);
  if (params.sortOrder) qp.set('sortOrder', params.sortOrder);
  const qs = qp.toString();

  return useQuery<PaginatedResponse<FindingTemplate>>({
    queryKey: ['finding-templates', params],
    queryFn: () => apiClient.get<PaginatedResponse<FindingTemplate>>(`/finding-templates${qs ? `?${qs}` : ''}`),
  });
}

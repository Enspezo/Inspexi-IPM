import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Asset, PaginatedResponse } from '@/types';

interface ListAssetsParams {
  search?: string;
  statusCode?: string;
  assetTypeCode?: string;
  contactId?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function useAssets(params: ListAssetsParams = {}) {
  const qp = new URLSearchParams();
  if (params.search) qp.set('search', params.search);
  if (params.statusCode) qp.set('statusCode', params.statusCode);
  if (params.assetTypeCode) qp.set('assetTypeCode', params.assetTypeCode);
  if (params.contactId) qp.set('contactId', params.contactId);
  if (params.page) qp.set('page', String(params.page));
  if (params.limit) qp.set('limit', String(params.limit));
  if (params.sortBy) qp.set('sortBy', params.sortBy);
  if (params.sortOrder) qp.set('sortOrder', params.sortOrder);
  const qs = qp.toString();

  return useQuery<PaginatedResponse<Asset>>({
    queryKey: ['assets', params],
    queryFn: () => apiClient.get<PaginatedResponse<Asset>>(`/assets${qs ? `?${qs}` : ''}`),
  });
}

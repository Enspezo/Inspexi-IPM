import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { assetKeys } from '@/lib/query-keys';
import type { Asset, Finding, PaginatedResponse } from '@/types';

/**
 * GET /assets/:id geeft een Asset PLUS extra relaties terug die de gedeelde
 * `Asset`-type niet declareert (measurementRecords/visualInspections). Daarom
 * lokaal getypeerd — dynamische rijen blijven losjes getypt.
 */
export interface AssetDetail extends Asset {
  findings?: Finding[];
  childAssets?: Asset[];
  measurementRecords?: Array<Record<string, unknown>>;
  visualInspections?: Array<Record<string, unknown>>;
}

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
    queryKey: assetKeys.list(params),
    queryFn: () => apiClient.get<PaginatedResponse<Asset>>(`/assets${qs ? `?${qs}` : ''}`),
  });
}

/** Detail van één asset, inclusief findings, child-assets en meet-/visuele records. */
export function useAsset(id: string) {
  return useQuery<AssetDetail>({
    queryKey: assetKeys.detail(id),
    queryFn: () => apiClient.get<AssetDetail>(`/assets/${id}`),
    enabled: !!id,
  });
}

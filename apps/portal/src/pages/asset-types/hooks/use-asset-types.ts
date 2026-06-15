import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { AssetTypeDefinition } from '@/types';

export interface UseAssetTypesParams {
  normType?: string;
}

export function useAssetTypes(params: UseAssetTypesParams = {}) {
  const query = new URLSearchParams();
  if (params.normType) query.set('normType', params.normType);
  const qs = query.toString();

  return useQuery<AssetTypeDefinition[]>({
    queryKey: ['asset-types', params],
    queryFn: () => apiClient.get<AssetTypeDefinition[]>(`/asset-types${qs ? `?${qs}` : ''}`),
  });
}

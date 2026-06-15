import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { LocationTypeDefinition } from '@/types';

export interface UseLocationTypesParams {
  normType?: string;
}

export function useLocationTypes(params: UseLocationTypesParams = {}) {
  const query = new URLSearchParams();
  if (params.normType) query.set('normType', params.normType);
  const qs = query.toString();

  return useQuery<LocationTypeDefinition[]>({
    queryKey: ['location-types', params],
    queryFn: () => apiClient.get<LocationTypeDefinition[]>(`/location-types${qs ? `?${qs}` : ''}`),
  });
}

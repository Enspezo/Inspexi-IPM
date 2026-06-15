import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { NormTypeDefinition } from '@/types';

export interface UseNormTypesParams {
  includeInactive?: boolean;
  includeDeleted?: boolean;
}

export function useNormTypes(params: UseNormTypesParams = {}) {
  const query = new URLSearchParams();
  if (params.includeInactive) query.set('includeInactive', 'true');
  if (params.includeDeleted) query.set('includeDeleted', 'true');
  const qs = query.toString();

  return useQuery<NormTypeDefinition[]>({
    queryKey: ['norm-types', params],
    queryFn: () => apiClient.get<NormTypeDefinition[]>(`/norm-types${qs ? `?${qs}` : ''}`),
  });
}

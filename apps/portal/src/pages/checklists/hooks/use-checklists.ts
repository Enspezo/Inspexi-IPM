import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Checklist } from '@/types';

interface ListParams {
  status?: string;
  normType?: string;
  assetType?: string;
  locationType?: string;
  includeSystem?: boolean;
}

export function useChecklists(params: ListParams = {}) {
  const qp = new URLSearchParams();
  if (params.status) qp.set('status', params.status);
  if (params.normType) qp.set('normType', params.normType);
  if (params.assetType) qp.set('assetType', params.assetType);
  if (params.locationType) qp.set('locationType', params.locationType);
  if (params.includeSystem) qp.set('includeSystem', 'true');
  const qs = qp.toString();

  return useQuery<Checklist[]>({
    queryKey: ['checklists', params],
    queryFn: () => apiClient.get<Checklist[]>(`/checklists${qs ? `?${qs}` : ''}`),
  });
}

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MeasurementSheetTemplate } from '@/types';

interface ListParams {
  status?: string;
  normType?: string;
  assetType?: string;
}

export function useMeasurementSheetTemplates(params: ListParams = {}) {
  const qp = new URLSearchParams();
  if (params.status) qp.set('status', params.status);
  if (params.normType) qp.set('normType', params.normType);
  if (params.assetType) qp.set('assetType', params.assetType);
  const qs = qp.toString();

  return useQuery<MeasurementSheetTemplate[]>({
    queryKey: ['measurement-sheet-templates', params],
    queryFn: () => apiClient.get<MeasurementSheetTemplate[]>(`/measurement-sheet-templates${qs ? `?${qs}` : ''}`),
  });
}

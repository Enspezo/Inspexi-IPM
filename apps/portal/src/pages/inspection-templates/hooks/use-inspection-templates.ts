import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { InspectionTemplate } from '@/types';

interface ListParams {
  status?: string;
  normType?: string;
  includeSystem?: boolean;
  search?: string;
}

/** Detail van één inspectie-template. */
export function useInspectionTemplate(id: string) {
  return useQuery<InspectionTemplate>({
    queryKey: ['inspection-template', id],
    queryFn: () => apiClient.get<InspectionTemplate>(`/inspection-templates/${id}`),
    enabled: !!id,
  });
}

export function useInspectionTemplates(params: ListParams = {}) {
  const qp = new URLSearchParams();
  if (params.status) qp.set('status', params.status);
  if (params.normType) qp.set('normType', params.normType);
  if (params.includeSystem) qp.set('includeSystem', 'true');
  if (params.search) qp.set('search', params.search);
  const qs = qp.toString();

  return useQuery<InspectionTemplate[]>({
    queryKey: ['inspection-templates', params],
    queryFn: () => apiClient.get<InspectionTemplate[]>(`/inspection-templates${qs ? `?${qs}` : ''}`),
  });
}

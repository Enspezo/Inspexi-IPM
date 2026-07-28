import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { myActivityKeys } from '@/lib/query-keys';
import type { AuditLogEntry, PaginatedResponse } from '@/types';

export interface UseMyActivityParams {
  entityType?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export function useMyActivity(params: UseMyActivityParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.entityType) queryParams.set('entityType', params.entityType);
  if (params.action) queryParams.set('action', params.action);
  if (params.dateFrom) queryParams.set('dateFrom', params.dateFrom);
  if (params.dateTo) queryParams.set('dateTo', params.dateTo);
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));

  const qs = queryParams.toString();
  const endpoint = `/audit-logs/me${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<AuditLogEntry>>({
    queryKey: myActivityKeys.list(params),
    queryFn: () => apiClient.get<PaginatedResponse<AuditLogEntry>>(endpoint),
  });
}

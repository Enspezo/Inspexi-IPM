import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { auditLogKeys } from '@/lib/query-keys';
import type { AuditLogEntry, PaginatedResponse } from '@/types';

interface UseAuditLogParams {
  page?: number;
  limit?: number;
}

export function useAuditLog(
  entityType: string,
  entityId: string | undefined,
  params: UseAuditLogParams = {},
) {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));

  const qs = queryParams.toString();
  const endpoint = `/audit-logs/${entityType}/${entityId}${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<AuditLogEntry>>({
    queryKey: auditLogKeys.list(entityType, entityId, params),
    queryFn: () =>
      apiClient.get<PaginatedResponse<AuditLogEntry>>(endpoint),
    enabled: !!entityId,
  });
}

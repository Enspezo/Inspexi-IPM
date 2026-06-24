import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PaginatedResponse } from '@/types';

export interface SupportAccessStatus {
  supportAccessEnabled: boolean;
  supportAccessExpiresAt: string | null;
}

export interface SupportAccessLog {
  id: string;
  action: 'ENABLED' | 'DISABLED' | 'EXPIRED' | 'ACCESSED';
  performedByRole: string | null;
  ip: string | null;
  note: string | null;
  createdAt: string;
  performedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export function useSupportAccess(orgId: string) {
  return useQuery<SupportAccessStatus>({
    queryKey: ['supportAccess', orgId],
    queryFn: () =>
      apiClient.get<SupportAccessStatus>(`/organizations/${orgId}/support-access`),
    enabled: !!orgId,
  });
}

export function useSetSupportAccess(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { enabled: boolean; expiresInHours?: number; note?: string }) =>
      apiClient.patch<SupportAccessStatus>(
        `/organizations/${orgId}/support-access`,
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supportAccess', orgId] });
      qc.invalidateQueries({ queryKey: ['supportAccessLogs', orgId] });
    },
  });
}

export function useSupportAccessLogs(orgId: string) {
  return useQuery<PaginatedResponse<SupportAccessLog>>({
    queryKey: ['supportAccessLogs', orgId],
    queryFn: () =>
      apiClient.get<PaginatedResponse<SupportAccessLog>>(
        `/organizations/${orgId}/support-access/logs?limit=20`,
      ),
    enabled: !!orgId,
  });
}

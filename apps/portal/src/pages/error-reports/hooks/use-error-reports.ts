import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import type { ErrorReport, ErrorReportStatus, PaginatedResponse } from '@/types';
import { errorReportKeys } from '@/lib/query-keys';

interface ErrorReportsParams {
  status?: ErrorReportStatus;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function useErrorReports(params: ErrorReportsParams = {}) {
  const { status, page = 1, limit = 20, sortBy, sortOrder } = params;

  const searchParams = new URLSearchParams();
  if (status) searchParams.set('status', status);
  searchParams.set('page', String(page));
  searchParams.set('limit', String(limit));
  if (sortBy) searchParams.set('sortBy', sortBy);
  if (sortOrder) searchParams.set('sortOrder', sortOrder);

  return useQuery({
    queryKey: errorReportKeys.list(params),
    queryFn: () =>
      apiClient.get<PaginatedResponse<ErrorReport>>(
        `/error-reports?${searchParams.toString()}`,
      ),
  });
}

export function useErrorReport(id: string | undefined) {
  return useQuery({
    queryKey: errorReportKeys.detail(id as string),
    queryFn: () => apiClient.get<ErrorReport>(`/error-reports/${id}`),
    enabled: !!id,
  });
}

export function useUpdateErrorReportStatus() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: ({ id, status }: { id: string; status: ErrorReportStatus }) =>
      apiClient.patch<ErrorReport>(`/error-reports/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: errorReportKeys.all });
    },
  });
}

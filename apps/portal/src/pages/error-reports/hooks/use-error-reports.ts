import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ErrorReport, ErrorReportStatus, PaginatedResponse } from '@/types';

interface ErrorReportsParams {
  status?: ErrorReportStatus;
  page?: number;
  limit?: number;
}

export function useErrorReports(params: ErrorReportsParams = {}) {
  const { status, page = 1, limit = 20 } = params;

  const searchParams = new URLSearchParams();
  if (status) searchParams.set('status', status);
  searchParams.set('page', String(page));
  searchParams.set('limit', String(limit));

  return useQuery({
    queryKey: ['error-reports', params],
    queryFn: () =>
      apiClient.get<PaginatedResponse<ErrorReport>>(
        `/error-reports?${searchParams.toString()}`,
      ),
  });
}

export function useErrorReport(id: string | undefined) {
  return useQuery({
    queryKey: ['error-reports', id],
    queryFn: () => apiClient.get<ErrorReport>(`/error-reports/${id}`),
    enabled: !!id,
  });
}

export function useUpdateErrorReportStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ErrorReportStatus }) =>
      apiClient.patch<ErrorReport>(`/error-reports/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['error-reports'] });
    },
  });
}

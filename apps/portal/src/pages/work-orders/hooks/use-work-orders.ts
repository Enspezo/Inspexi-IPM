import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { WorkOrder, WorkOrderStatus } from '@/types';

interface WorkOrdersParams {
  search?: string;
  status?: WorkOrderStatus;
  planningItemId?: string;
  inspectorId?: string;
  page?: number;
  limit?: number;
  enabled?: boolean;
}

interface PaginatedWorkOrders {
  data: WorkOrder[];
  total: number;
  page: number;
  limit: number;
}

export function useWorkOrders(params?: WorkOrdersParams) {
  const queryParams = new URLSearchParams();
  if (params?.search) queryParams.set('search', params.search);
  if (params?.status) queryParams.set('status', params.status);
  if (params?.planningItemId) queryParams.set('planningItemId', params.planningItemId);
  if (params?.inspectorId) queryParams.set('inspectorId', params.inspectorId);
  if (params?.page) queryParams.set('page', String(params.page));
  if (params?.limit) queryParams.set('limit', String(params.limit));
  const qs = queryParams.toString();

  return useQuery<PaginatedWorkOrders>({
    queryKey: ['work-orders', params],
    queryFn: () => apiClient.get<PaginatedWorkOrders>(`/work-orders${qs ? `?${qs}` : ''}`),
    enabled: params?.enabled,
  });
}

export function useWorkOrder(id: string | undefined) {
  return useQuery<WorkOrder>({
    queryKey: ['work-orders', id],
    queryFn: () => apiClient.get<WorkOrder>(`/work-orders/${id}`),
    enabled: !!id,
  });
}

export function usePlanningWorkOrders(planningItemId: string | undefined) {
  return useQuery<PaginatedWorkOrders>({
    queryKey: ['work-orders', { planningItemId }],
    queryFn: () =>
      apiClient.get<PaginatedWorkOrders>(
        `/work-orders?planningItemId=${planningItemId}&limit=50`,
      ),
    enabled: !!planningItemId,
  });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      planningItemId?: string;
      workOrderNumber?: string;
      internalNotes?: string;
      startTime?: string;
      endTime?: string;
    }) => apiClient.post<WorkOrder>('/work-orders', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });
}

export function useUpdateWorkOrder(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      internalNotes?: string;
      startTime?: string;
      endTime?: string;
      projectPhaseId?: string | null;
    }) => apiClient.patch<WorkOrder>(`/work-orders/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });
}

export function useUpdateWorkOrderStatus(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { status: WorkOrderStatus; note?: string }) =>
      apiClient.patch<WorkOrder>(`/work-orders/${id}/status`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });
}

export function useSetWorkOrderLines(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      lines: Array<{
        productId?: string;
        description: string;
        quantity: number;
        unit: string;
        unitPrice: number;
        vatRate?: number;
        sortOrder?: number;
      }>;
    }) => apiClient.put<WorkOrder>(`/work-orders/${id}/lines`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });
}

export function useDeleteWorkOrder(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete(`/work-orders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });
}

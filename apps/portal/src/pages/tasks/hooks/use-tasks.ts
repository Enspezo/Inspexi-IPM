import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  Task,
  PaginatedResponse,
  TaskStatus,
  TaskEntityType,
} from '@/types';

interface ListTasksParams {
  search?: string;
  status?: TaskStatus;
  entityType?: TaskEntityType;
  entityId?: string;
  onlyMine?: boolean;
  page?: number;
  limit?: number;
}

export function useTasks(params: ListTasksParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.status) queryParams.set('status', params.status);
  if (params.entityType) queryParams.set('entityType', params.entityType);
  if (params.entityId) queryParams.set('entityId', params.entityId);
  if (params.onlyMine) queryParams.set('onlyMine', 'true');
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));

  const qs = queryParams.toString();
  const endpoint = `/tasks${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<Task>>({
    queryKey: ['tasks', params],
    queryFn: () => apiClient.get<PaginatedResponse<Task>>(endpoint),
  });
}

export function useTask(id: string) {
  return useQuery<Task>({
    queryKey: ['tasks', id],
    queryFn: () => apiClient.get<Task>(`/tasks/${id}`),
    enabled: !!id,
  });
}

interface CreateTaskDto {
  title: string;
  description?: string;
  status?: TaskStatus;
  entityType: TaskEntityType;
  entityId: string;
  assigneeId?: string;
  deadline?: string;
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTaskDto) =>
      apiClient.post<Task>('/tasks', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

interface UpdateTaskDto {
  title?: string;
  description?: string;
  status?: TaskStatus;
  assigneeId?: string | null;
  deadline?: string | null;
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskDto }) =>
      apiClient.patch<Task>(`/tasks/${id}`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.id] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import { customFieldKeys } from '@/lib/query-keys';
import type {
  CustomFieldDefinition,
  CustomFieldEntityType,
  CustomFieldType,
} from '@/types';

const CUSTOM_FIELDS_STALE_TIME = 60 * 60 * 1000; // 1 hour — schema config, rarely changes

export function useCustomFields() {
  return useQuery<CustomFieldDefinition[]>({
    queryKey: customFieldKeys.all,
    queryFn: () => apiClient.get('/custom-fields'),
    staleTime: CUSTOM_FIELDS_STALE_TIME,
  });
}

export function useCustomFieldsByEntityType(entityType: CustomFieldEntityType) {
  return useQuery<CustomFieldDefinition[]>({
    queryKey: customFieldKeys.byEntity(entityType),
    queryFn: () => apiClient.get(`/custom-fields/${entityType}`),
    staleTime: CUSTOM_FIELDS_STALE_TIME,
  });
}

interface CreateCustomFieldData {
  entityType: CustomFieldEntityType;
  label: string;
  fieldType: CustomFieldType;
  options?: string[];
  isRequired?: boolean;
}

export function useCreateCustomField() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (data: CreateCustomFieldData) =>
      apiClient.post<CustomFieldDefinition>('/custom-fields', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customFieldKeys.all });
    },
  });
}

interface UpdateCustomFieldData {
  label?: string;
  options?: string[];
  isRequired?: boolean;
}

export function useUpdateCustomField(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (data: UpdateCustomFieldData) =>
      apiClient.patch<CustomFieldDefinition>(`/custom-fields/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customFieldKeys.all });
    },
  });
}

export function useDeleteCustomField() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => apiClient.delete(`/custom-fields/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customFieldKeys.all });
    },
  });
}

export function useReorderCustomFields() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (orderedIds: string[]) =>
      apiClient.patch('/custom-fields/reorder', { orderedIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customFieldKeys.all });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  CustomFieldDefinition,
  CustomFieldEntityType,
  CustomFieldType,
} from '@/types';

export function useCustomFields() {
  return useQuery<CustomFieldDefinition[]>({
    queryKey: ['custom-fields'],
    queryFn: () => apiClient.get('/custom-fields'),
  });
}

export function useCustomFieldsByEntityType(entityType: CustomFieldEntityType) {
  return useQuery<CustomFieldDefinition[]>({
    queryKey: ['custom-fields', entityType],
    queryFn: () => apiClient.get(`/custom-fields/${entityType}`),
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
  return useMutation({
    mutationFn: (data: CreateCustomFieldData) =>
      apiClient.post<CustomFieldDefinition>('/custom-fields', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
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
  return useMutation({
    mutationFn: (data: UpdateCustomFieldData) =>
      apiClient.patch<CustomFieldDefinition>(`/custom-fields/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
    },
  });
}

export function useDeleteCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/custom-fields/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
    },
  });
}

export function useReorderCustomFields() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      apiClient.patch('/custom-fields/reorder', { orderedIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
    },
  });
}

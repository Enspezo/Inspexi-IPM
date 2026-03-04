import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ProductGroup, PaginatedResponse } from '@/types';

interface ListParams {
  search?: string;
  page?: number;
  limit?: number;
}

export function useProductGroups(params: ListParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));

  const qs = queryParams.toString();
  const endpoint = `/product-groups${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<ProductGroup>>({
    queryKey: ['product-groups', params],
    queryFn: () => apiClient.get<PaginatedResponse<ProductGroup>>(endpoint),
  });
}

export function useProductGroupsCompact() {
  return useQuery<{ id: string; name: string }[]>({
    queryKey: ['product-groups', 'compact'],
    queryFn: () =>
      apiClient.get<{ id: string; name: string }[]>('/product-groups/compact'),
    staleTime: 30 * 60 * 1000, // 30 min — dropdown options, admin-only changes
  });
}

export function useProductGroup(id: string) {
  return useQuery<ProductGroup>({
    queryKey: ['product-groups', id],
    queryFn: () => apiClient.get<ProductGroup>(`/product-groups/${id}`),
    enabled: !!id,
  });
}

interface CreateDto {
  name: string;
  notes?: string;
}

export function useCreateProductGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDto) =>
      apiClient.post<ProductGroup>('/product-groups', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-groups'] });
    },
  });
}

export function useUpdateProductGroup(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateDto>) =>
      apiClient.patch<ProductGroup>(`/product-groups/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-groups'] });
    },
  });
}

export function useDeleteProductGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/product-groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-groups'] });
    },
  });
}

// ─── Product koppeling ────────────────────────────────────

export function useAddProductToGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) =>
      apiClient.post<ProductGroup>(`/product-groups/${groupId}/products`, { productId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-groups', groupId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useRemoveProductFromGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) =>
      apiClient.delete<ProductGroup>(`/product-groups/${groupId}/products/${productId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-groups', groupId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

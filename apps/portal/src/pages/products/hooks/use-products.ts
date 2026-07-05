import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { productKeys } from '@/lib/query-keys';
import type { Product, PaginatedResponse } from '@/types';

export function useProduct(id: string) {
  return useQuery<Product>({
    queryKey: productKeys.detail(id),
    queryFn: () => apiClient.get<Product>(`/products/${id}`),
    enabled: !!id,
  });
}

interface ListProductsParams {
  search?: string;
  productGroupId?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  enabled?: boolean;
}

export function useProducts(params: ListProductsParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.productGroupId) queryParams.set('productGroupId', params.productGroupId);
  if (params.isActive !== undefined) queryParams.set('isActive', String(params.isActive));
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));
  if (params.sortBy) queryParams.set('sortBy', params.sortBy);
  if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);

  const qs = queryParams.toString();
  const endpoint = `/products${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<Product>>({
    queryKey: productKeys.list(params),
    queryFn: () => apiClient.get<PaginatedResponse<Product>>(endpoint),
    enabled: params.enabled,
  });
}

interface CreateProductDto {
  name: string;
  productCode?: string;
  unit: string;
  description?: string;
  defaultVat?: number;
  productGroupId?: string;
  isActive?: boolean;
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProductDto) =>
      apiClient.post<Product>('/products', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.all });
    },
  });
}

interface UpdateProductDto extends Partial<CreateProductDto> {}

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateProductDto) =>
      apiClient.patch<Product>(`/products/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.all });
    },
  });
}


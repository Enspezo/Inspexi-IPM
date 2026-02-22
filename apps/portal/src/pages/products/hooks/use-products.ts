import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Product, PaginatedResponse } from '@/types';

interface ListProductsParams {
  search?: string;
  category?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export function useProducts(params: ListProductsParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.category) queryParams.set('category', params.category);
  if (params.isActive !== undefined) queryParams.set('isActive', String(params.isActive));
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));

  const qs = queryParams.toString();
  const endpoint = `/products${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<Product>>({
    queryKey: ['products', params],
    queryFn: () => apiClient.get<PaginatedResponse<Product>>(endpoint),
  });
}

interface CreateProductDto {
  name: string;
  unit: string;
  description?: string;
  defaultVat?: number;
  category?: string;
  isActive?: boolean;
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProductDto) =>
      apiClient.post<Product>('/products', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
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
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

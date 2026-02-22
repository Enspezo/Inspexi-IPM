import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PriceTable, PriceType, PaginatedResponse } from '@/types';

interface ListPriceTablesParams {
  search?: string;
  page?: number;
  limit?: number;
}

export function usePriceTables(params: ListPriceTablesParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));

  const qs = queryParams.toString();
  const endpoint = `/price-tables${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<PriceTable>>({
    queryKey: ['price-tables', params],
    queryFn: () => apiClient.get<PaginatedResponse<PriceTable>>(endpoint),
  });
}

export function usePriceTable(id: string) {
  return useQuery<PriceTable>({
    queryKey: ['price-tables', id],
    queryFn: () => apiClient.get<PriceTable>(`/price-tables/${id}`),
    enabled: !!id,
  });
}

interface CreatePriceTableDto {
  name: string;
  description?: string;
  isDefault?: boolean;
}

export function useCreatePriceTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePriceTableDto) =>
      apiClient.post<PriceTable>('/price-tables', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-tables'] });
    },
  });
}

interface PriceTableItemInput {
  productId: string;
  priceType: PriceType;
  basePrice?: number;
  tiers?: { fromQty: number; toQty?: number; price: number }[];
}

export function useSetPriceTableItems(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (items: PriceTableItemInput[]) =>
      apiClient.put<PriceTable>(`/price-tables/${id}/items`, { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-tables', id] });
      queryClient.invalidateQueries({ queryKey: ['price-tables'] });
    },
  });
}

export function useAssignPriceTable(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contactId: string) =>
      apiClient.post(`/price-tables/${id}/assign/${contactId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-tables', id] });
    },
  });
}

export function useRemovePriceTableAssignment(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contactId: string) =>
      apiClient.delete(`/price-tables/${id}/assign/${contactId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-tables', id] });
    },
  });
}

export function usePriceTableForContact(contactId: string) {
  return useQuery<PriceTable[]>({
    queryKey: ['price-tables', 'for-contact', contactId],
    queryFn: () =>
      apiClient.get<PriceTable[]>(`/price-tables/for-contact/${contactId}`),
    enabled: !!contactId,
  });
}

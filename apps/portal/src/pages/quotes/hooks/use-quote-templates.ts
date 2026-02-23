import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { QuoteTemplate, PaginatedResponse } from '@/types';

interface ListQuoteTemplatesParams {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export function useQuoteTemplates(params: ListQuoteTemplatesParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.isActive !== undefined) queryParams.set('isActive', String(params.isActive));
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));

  const qs = queryParams.toString();
  const endpoint = `/quote-templates${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<QuoteTemplate>>({
    queryKey: ['quote-templates', params],
    queryFn: () => apiClient.get<PaginatedResponse<QuoteTemplate>>(endpoint),
  });
}

export function useQuoteTemplate(id: string) {
  return useQuery<QuoteTemplate>({
    queryKey: ['quote-templates', id],
    queryFn: () => apiClient.get<QuoteTemplate>(`/quote-templates/${id}`),
    enabled: !!id,
  });
}

interface CreateQuoteTemplateDto {
  name: string;
  defaultValidityDays?: number;
  requiresApproval?: boolean;
}

export function useCreateQuoteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateQuoteTemplateDto) =>
      apiClient.post<QuoteTemplate>('/quote-templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-templates'] });
    },
  });
}

interface UpdateQuoteTemplateDto {
  name?: string;
  defaultValidityDays?: number;
  requiresApproval?: boolean;
  isActive?: boolean;
}

export function useUpdateQuoteTemplate(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateQuoteTemplateDto) =>
      apiClient.patch<QuoteTemplate>(`/quote-templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-templates'] });
    },
  });
}

export function useDeleteQuoteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/quote-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-templates'] });
    },
  });
}

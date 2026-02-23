import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  Quote,
  QuoteLine,
  PaginatedResponse,
  QuoteStatus,
  ResolvedPrice,
} from '@/types';

interface ListQuotesParams {
  search?: string;
  status?: QuoteStatus;
  contactId?: string;
  page?: number;
  limit?: number;
}

export function useQuotes(params: ListQuotesParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.status) queryParams.set('status', params.status);
  if (params.contactId) queryParams.set('contactId', params.contactId);
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));

  const qs = queryParams.toString();
  const endpoint = `/quotes${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<Quote>>({
    queryKey: ['quotes', params],
    queryFn: () => apiClient.get<PaginatedResponse<Quote>>(endpoint),
  });
}

export function useQuote(id: string) {
  return useQuery<Quote>({
    queryKey: ['quotes', id],
    queryFn: () => apiClient.get<Quote>(`/quotes/${id}`),
    enabled: !!id,
  });
}

interface CreateQuoteDto {
  templateId?: string;
  requestId?: string;
  contactId: string;
  locationId?: string;
  subject: string;
  validUntil?: string;
  internalNotes?: string;
}

export function useCreateQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateQuoteDto) =>
      apiClient.post<Quote>('/quotes', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

interface UpdateQuoteDto {
  subject?: string;
  contactId?: string;
  locationId?: string;
  templateId?: string;
  validUntil?: string;
  internalNotes?: string;
}

export function useUpdateQuote(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateQuoteDto) =>
      apiClient.patch<Quote>(`/quotes/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

interface SetQuoteLinesDto {
  lines: {
    productId?: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    vatRate: number;
    discountPct: number;
    sortOrder: number;
  }[];
}

export function useSetQuoteLines(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SetQuoteLinesDto) =>
      apiClient.put<QuoteLine[]>(`/quotes/${id}/lines`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

export function useSubmitApproval(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient.post<Quote>(`/quotes/${id}/submit-approval`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

export function useApproveQuote(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient.post<Quote>(`/quotes/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

interface RejectQuoteDto {
  note?: string;
}

export function useRejectQuote(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data?: RejectQuoteDto) =>
      apiClient.post<Quote>(`/quotes/${id}/reject`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

interface UpdateQuoteStatusDto {
  status: string;
}

export function useUpdateQuoteStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateQuoteStatusDto) =>
      apiClient.patch<Quote>(`/quotes/${id}/status`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

export function useDeleteQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/quotes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

interface ResolvePriceParams {
  productId: string;
  contactId: string;
  quantity?: number;
}

export function useResolvePrice(params: ResolvePriceParams) {
  const queryParams = new URLSearchParams();
  queryParams.set('productId', params.productId);
  queryParams.set('contactId', params.contactId);
  if (params.quantity) queryParams.set('quantity', String(params.quantity));

  const qs = queryParams.toString();

  return useQuery<ResolvedPrice>({
    queryKey: ['quotes', 'resolve-price', params],
    queryFn: () =>
      apiClient.get<ResolvedPrice>(`/quotes/resolve-price?${qs}`),
    enabled: !!params.productId && !!params.contactId,
  });
}

export function useCreateQuoteFromRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestId: string) =>
      apiClient.post<Quote>(`/requests/${requestId}/quote`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

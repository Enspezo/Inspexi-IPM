import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, getAccessToken } from '@/lib/api-client';
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
  createdBy?: string;
  templateId?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function useQuotes(params: ListQuotesParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.status) queryParams.set('status', params.status);
  if (params.contactId) queryParams.set('contactId', params.contactId);
  if (params.createdBy) queryParams.set('createdBy', params.createdBy);
  if (params.templateId) queryParams.set('templateId', params.templateId);
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));
  if (params.sortBy) queryParams.set('sortBy', params.sortBy);
  if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);

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
    // Refetch when returning to the tab (e.g. after client signs on public page)
    refetchOnWindowFocus: 'always',
    // Poll every 30s when quote is in a status where external changes can happen
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'VERSTUURD' || status === 'BEKEKEN') return 30_000;
      return false;
    },
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
  contentBlocks?: object | null;
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

interface ApproveQuoteDto {
  note?: string;
  managerSignature?: string;
}

export function useApproveQuote(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data?: ApproveQuoteDto) =>
      apiClient.post<Quote>(`/quotes/${id}/approve`, data),
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

interface SendQuoteDto {
  to: string;
  cc?: string[];
  subject: string;
  bodyText: string;
}

export function useSendQuote(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendQuoteDto) =>
      apiClient.post<Quote>(`/quotes/${id}/send`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

interface AddQuestionDto {
  message: string;
}

export function useAddQuestion(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AddQuestionDto) =>
      apiClient.post(`/quotes/${id}/questions`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', id] });
    },
  });
}

export function useAnswerQuestion(id: string, questionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AddQuestionDto) =>
      apiClient.post(`/quotes/${id}/questions/${questionId}/answer`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', id] });
    },
  });
}

export function useUploadQuoteAttachment(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.upload(`/quotes/${id}/attachments`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', id] });
    },
  });
}

/**
 * Preview PDF for a DOCX-template quote.
 * Fetches the rendered PDF and returns a blob URL for embedding in a modal.
 */
export async function previewQuotePdf(id: string): Promise<string> {
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`/api/v1/quotes/${id}/preview-pdf`, {
    headers,
    credentials: 'include',
  });
  if (!response.ok) throw new Error('PDF preview mislukt');

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function useDeleteQuoteAttachment(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (attachmentId: string) =>
      apiClient.delete(`/quotes/${id}/attachments/${attachmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', id] });
    },
  });
}

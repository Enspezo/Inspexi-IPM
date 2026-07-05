import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { quoteTemplateKeys } from '@/lib/query-keys';
import type {
  QuoteTemplate,
  QuoteTemplateAttachment,
  QuoteTemplateDocxRevision,
  QuoteTemplateFollowUp,
  QuoteTemplateType,
  ContentBlock,
  PaginatedResponse,
  FollowUpType,
  FollowUpAssigneeType,
} from '@/types';

interface ListQuoteTemplatesParams {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function useQuoteTemplates(params: ListQuoteTemplatesParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.isActive !== undefined) queryParams.set('isActive', String(params.isActive));
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));
  if (params.sortBy) queryParams.set('sortBy', params.sortBy);
  if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);

  const qs = queryParams.toString();
  const endpoint = `/quote-templates${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<QuoteTemplate>>({
    queryKey: quoteTemplateKeys.list(params),
    queryFn: () => apiClient.get<PaginatedResponse<QuoteTemplate>>(endpoint),
  });
}

export function useQuoteTemplate(id: string) {
  return useQuery<QuoteTemplate>({
    queryKey: quoteTemplateKeys.detail(id),
    queryFn: () => apiClient.get<QuoteTemplate>(`/quote-templates/${id}`),
    enabled: !!id,
  });
}

interface CreateQuoteTemplateDto {
  name: string;
  description?: string;
  templateType?: QuoteTemplateType;
  defaultValidityDays?: number;
  requiresApproval?: boolean;
  contentBlocks?: ContentBlock[];
}

export function useCreateQuoteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateQuoteTemplateDto) =>
      apiClient.post<QuoteTemplate>('/quote-templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteTemplateKeys.all });
    },
  });
}

interface UpdateQuoteTemplateDto {
  name?: string;
  description?: string;
  defaultValidityDays?: number;
  requiresApproval?: boolean;
  isActive?: boolean;
  contentBlocks?: ContentBlock[];
  sendEmailTemplateId?: string | null;
  sendEmailEnabled?: boolean;
  acceptedEmailTemplateId?: string | null;
  acceptedEmailEnabled?: boolean;
}

export function useUpdateQuoteTemplate(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateQuoteTemplateDto) =>
      apiClient.patch<QuoteTemplate>(`/quote-templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteTemplateKeys.all });
    },
  });
}

export function useDeleteQuoteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/quote-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteTemplateKeys.all });
    },
  });
}

// ── Image upload for block editor ──────────────────────────

export function useUploadTemplateImage(templateId: string) {
  return useMutation({
    mutationFn: (formData: FormData) =>
      apiClient.upload<{ storageKey: string; fileName: string }>(
        `/quote-templates/${templateId}/images`,
        formData,
      ),
  });
}

// ── Template attachments ───────────────────────────────────

export function useTemplateAttachments(templateId: string) {
  return useQuery<QuoteTemplateAttachment[]>({
    queryKey: quoteTemplateKeys.attachments(templateId),
    queryFn: () =>
      apiClient.get<QuoteTemplateAttachment[]>(
        `/quote-templates/${templateId}/attachments`,
      ),
    enabled: !!templateId,
  });
}

export function useUploadTemplateAttachment(templateId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (formData: FormData) =>
      apiClient.upload<QuoteTemplateAttachment>(
        `/quote-templates/${templateId}/attachments`,
        formData,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: quoteTemplateKeys.attachments(templateId),
      });
    },
  });
}

export function useDeleteTemplateAttachment(templateId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (attachmentId: string) =>
      apiClient.delete(
        `/quote-templates/${templateId}/attachments/${attachmentId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: quoteTemplateKeys.attachments(templateId),
      });
    },
  });
}

export function useReorderTemplateAttachments(templateId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (attachmentIds: string[]) =>
      apiClient.patch(
        `/quote-templates/${templateId}/attachments/reorder`,
        { attachmentIds },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: quoteTemplateKeys.attachments(templateId),
      });
    },
  });
}

// ── DOCX file management ────────────────────────────────────

export function useUploadDocxFile(templateId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (formData: FormData) =>
      apiClient.upload<QuoteTemplate>(
        `/quote-templates/${templateId}/docx`,
        formData,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: quoteTemplateKeys.detail(templateId),
      });
      queryClient.invalidateQueries({
        queryKey: quoteTemplateKeys.docxRevisions(templateId),
      });
    },
  });
}

export function useDocxRevisions(templateId: string) {
  return useQuery<QuoteTemplateDocxRevision[]>({
    queryKey: quoteTemplateKeys.docxRevisions(templateId),
    queryFn: () =>
      apiClient.get<QuoteTemplateDocxRevision[]>(
        `/quote-templates/${templateId}/docx/revisions`,
      ),
    enabled: !!templateId,
  });
}

// ── Follow-up rules ───────────────────────────────────────

export function useFollowUpRules(templateId: string) {
  return useQuery<QuoteTemplateFollowUp[]>({
    queryKey: quoteTemplateKeys.followUps(templateId),
    queryFn: () =>
      apiClient.get<QuoteTemplateFollowUp[]>(
        `/quote-templates/${templateId}/follow-ups`,
      ),
    enabled: !!templateId,
  });
}

interface CreateFollowUpDto {
  type: FollowUpType;
  delayDays: number;
  isActive?: boolean;
  emailTemplateId?: string | null;
  defaultNotes?: string;
  assigneeType?: FollowUpAssigneeType;
  assigneeUserId?: string | null;
}

export function useCreateFollowUp(templateId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateFollowUpDto) =>
      apiClient.post<QuoteTemplateFollowUp>(
        `/quote-templates/${templateId}/follow-ups`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: quoteTemplateKeys.followUps(templateId),
      });
      queryClient.invalidateQueries({
        queryKey: quoteTemplateKeys.detail(templateId),
      });
    },
  });
}

interface UpdateFollowUpDto {
  type?: FollowUpType;
  delayDays?: number;
  isActive?: boolean;
  emailTemplateId?: string | null;
  defaultNotes?: string;
  assigneeType?: FollowUpAssigneeType;
  assigneeUserId?: string | null;
}

export function useUpdateFollowUp(templateId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ followUpId, data }: { followUpId: string; data: UpdateFollowUpDto }) =>
      apiClient.patch<QuoteTemplateFollowUp>(
        `/quote-templates/${templateId}/follow-ups/${followUpId}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: quoteTemplateKeys.followUps(templateId),
      });
      queryClient.invalidateQueries({
        queryKey: quoteTemplateKeys.detail(templateId),
      });
    },
  });
}

export function useDeleteFollowUp(templateId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (followUpId: string) =>
      apiClient.delete(
        `/quote-templates/${templateId}/follow-ups/${followUpId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: quoteTemplateKeys.followUps(templateId),
      });
      queryClient.invalidateQueries({
        queryKey: quoteTemplateKeys.detail(templateId),
      });
    },
  });
}

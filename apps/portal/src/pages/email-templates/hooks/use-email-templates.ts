import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { EmailTemplate, EmailTemplateAttachment, EmailTemplateType, EmailTemplateTypeInfo, PaginatedResponse } from '@/types';

interface ListEmailTemplatesParams {
  search?: string;
  type?: EmailTemplateType;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export function useEmailTemplates(params: ListEmailTemplatesParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.type) queryParams.set('type', params.type);
  if (params.isActive !== undefined) queryParams.set('isActive', String(params.isActive));
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));

  const qs = queryParams.toString();
  const endpoint = `/email-templates${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<EmailTemplate>>({
    queryKey: ['email-templates', params],
    queryFn: () => apiClient.get<PaginatedResponse<EmailTemplate>>(endpoint),
  });
}

export function useEmailTemplate(id: string) {
  return useQuery<EmailTemplate>({
    queryKey: ['email-templates', id],
    queryFn: () => apiClient.get<EmailTemplate>(`/email-templates/${id}`),
    enabled: !!id,
  });
}

export function useEmailTemplateTypes() {
  return useQuery<EmailTemplateTypeInfo[]>({
    queryKey: ['email-template-types'],
    queryFn: () => apiClient.get<EmailTemplateTypeInfo[]>('/email-templates/types'),
    staleTime: 1000 * 60 * 60, // 1 hour — these don't change
  });
}

interface CreateEmailTemplateDto {
  type: EmailTemplateType;
  name: string;
  subject: string;
  bodyJson?: object;
  bodyHtml: string;
}

export function useCreateEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateEmailTemplateDto) =>
      apiClient.post<EmailTemplate>('/email-templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });
}

interface UpdateEmailTemplateDto {
  name?: string;
  subject?: string;
  bodyJson?: object;
  bodyHtml?: string;
  isActive?: boolean;
}

export function useUpdateEmailTemplate(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateEmailTemplateDto) =>
      apiClient.patch<EmailTemplate>(`/email-templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });
}

export function useDeleteEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/email-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });
}

export function useDuplicateEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.post<EmailTemplate>(`/email-templates/${id}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });
}

export function usePreviewEmailTemplate() {
  return useMutation({
    mutationFn: (data: { subject: string; bodyHtml: string; type: EmailTemplateType }) =>
      apiClient.post<{ subject: string; html: string }>('/email-templates/preview', data),
  });
}

// ─── Attachment hooks ───────────────────────────────────

export function useEmailTemplateAttachments(templateId: string) {
  return useQuery<EmailTemplateAttachment[]>({
    queryKey: ['email-templates', templateId, 'attachments'],
    queryFn: () =>
      apiClient.get<EmailTemplateAttachment[]>(
        `/email-templates/${templateId}/attachments`,
      ),
    enabled: !!templateId,
  });
}

export function useUploadEmailTemplateAttachment(templateId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      apiClient.upload<EmailTemplateAttachment>(
        `/email-templates/${templateId}/attachments`,
        formData,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['email-templates', templateId, 'attachments'],
      });
      queryClient.invalidateQueries({
        queryKey: ['email-templates', templateId],
      });
    },
  });
}

export function useDeleteEmailTemplateAttachment(templateId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) =>
      apiClient.delete(
        `/email-templates/${templateId}/attachments/${attachmentId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['email-templates', templateId, 'attachments'],
      });
      queryClient.invalidateQueries({
        queryKey: ['email-templates', templateId],
      });
    },
  });
}

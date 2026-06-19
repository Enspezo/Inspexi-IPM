// Template-prompts (laag 2, ORG_ADMIN) — /voice-prompts/template. use-tasks-patroon.
// Upsert is één PUT per meetstaat-template (uniek per org+template); de backend leidt de org af uit user.orgId.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { VoiceTemplatePrompt } from '@/types';

const KEY = ['voice-template-prompts'];

export function useTemplatePrompts() {
  return useQuery<VoiceTemplatePrompt[]>({
    queryKey: KEY,
    queryFn: () => apiClient.get<VoiceTemplatePrompt[]>('/voice-prompts/template'),
  });
}

interface UpsertTemplatePromptDto {
  content: string;
  isActive?: boolean;
}

export function useUpsertTemplatePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, data }: { templateId: string; data: UpsertTemplatePromptDto }) =>
      apiClient.put<VoiceTemplatePrompt>(`/voice-prompts/template/${templateId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteTemplatePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => apiClient.delete(`/voice-prompts/template/${templateId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

// Base-prompts (laag 1, SUPERUSER) — /admin/voice-prompts. use-tasks-patroon.
// Activeren gaat via een eigen endpoint dat de overige prompts deactiveert (exact één actief).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { VoiceBasePrompt } from '@/types';

const KEY = ['voice-base-prompts'];

export function useBasePrompts() {
  return useQuery<VoiceBasePrompt[]>({
    queryKey: KEY,
    queryFn: () => apiClient.get<VoiceBasePrompt[]>('/admin/voice-prompts/base'),
  });
}

interface CreateBasePromptDto {
  name: string;
  content: string;
  isActive?: boolean;
}

export function useCreateBasePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBasePromptDto) =>
      apiClient.post<VoiceBasePrompt>('/admin/voice-prompts/base', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

interface UpdateBasePromptDto {
  name?: string;
  content?: string;
  isActive?: boolean;
}

export function useUpdateBasePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBasePromptDto }) =>
      apiClient.patch<VoiceBasePrompt>(`/admin/voice-prompts/base/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useActivateBasePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<VoiceBasePrompt>(`/admin/voice-prompts/base/${id}/activate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteBasePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/voice-prompts/base/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

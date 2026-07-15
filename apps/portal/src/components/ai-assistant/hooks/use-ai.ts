import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { AiConversation, AiUsageSummary } from '@/types';

const LIST_KEY = ['ai', 'conversations'];

export function useAiConversations(enabled = true) {
  return useQuery<AiConversation[]>({
    queryKey: LIST_KEY,
    queryFn: () => apiClient.get<AiConversation[]>('/ai/conversations'),
    enabled,
  });
}

export function useAiConversation(id: string | null) {
  return useQuery<AiConversation>({
    queryKey: ['ai', 'conversation', id],
    queryFn: () => apiClient.get<AiConversation>(`/ai/conversations/${id}`),
    enabled: !!id,
  });
}

export function useCreateAiConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) =>
      apiClient.post<AiConversation>('/ai/conversations', { title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useArchiveAiConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/ai/conversations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useAiUsage(enabled = true) {
  return useQuery<AiUsageSummary>({
    queryKey: ['ai', 'usage'],
    queryFn: () => apiClient.get<AiUsageSummary>('/ai/usage'),
    enabled,
    staleTime: 60_000,
  });
}

export function useConfirmAiAction() {
  return useMutation({
    mutationFn: ({ id, args }: { id: string; args?: Record<string, unknown> }) =>
      apiClient.post(`/ai/actions/${id}/confirm`, args ? { args } : {}),
  });
}

export function useRejectAiAction() {
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/ai/actions/${id}/reject`, {}),
  });
}

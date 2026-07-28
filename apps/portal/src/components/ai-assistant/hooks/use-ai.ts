import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { aiAgentKeys } from '@/lib/query-keys';
import type { AiConversation, AiUsageSummary } from '@/types';

export function useAiConversations(enabled = true) {
  return useQuery<AiConversation[]>({
    queryKey: aiAgentKeys.conversations(),
    queryFn: () => apiClient.get<AiConversation[]>('/ai/conversations'),
    enabled,
  });
}

export function useAiConversation(id: string | null) {
  return useQuery<AiConversation>({
    queryKey: aiAgentKeys.conversation(id),
    queryFn: () => apiClient.get<AiConversation>(`/ai/conversations/${id}`),
    enabled: !!id,
  });
}

export function useCreateAiConversation() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (title?: string) =>
      apiClient.post<AiConversation>('/ai/conversations', { title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: aiAgentKeys.conversations() }),
  });
}

export function useArchiveAiConversation() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => apiClient.delete(`/ai/conversations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: aiAgentKeys.conversations() }),
  });
}

export function useAiUsage(enabled = true) {
  return useQuery<AiUsageSummary>({
    queryKey: aiAgentKeys.usage(),
    queryFn: () => apiClient.get<AiUsageSummary>('/ai/usage'),
    enabled,
    staleTime: 60_000,
  });
}

export function useConfirmAiAction() {
  return useApiMutation({
    mutationFn: ({ id, args }: { id: string; args?: Record<string, unknown> }) =>
      apiClient.post(`/ai/actions/${id}/confirm`, args ? { args } : {}),
  });
}

export function useRejectAiAction() {
  return useApiMutation({
    mutationFn: (id: string) => apiClient.post(`/ai/actions/${id}/reject`, {}),
  });
}

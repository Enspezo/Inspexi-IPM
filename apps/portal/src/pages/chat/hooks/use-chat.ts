import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  Availability,
  ChatMessage,
  ChatThread,
  ChatUnreadResponse,
  ChatUser,
  Role,
  UserPresence,
} from '@/types';
import { chatKeys } from '@/lib/query-keys';

export interface CreateThreadInput {
  type: 'DIRECT' | 'TEAM';
  userId?: string;
  teamRole?: Role;
  subject?: string;
  referenceEntityType?: string;
  referenceEntityId?: string;
}

export interface SendMessageInput {
  content: string;
  mentionedUserIds?: string[];
  referenceEntityType?: string;
  referenceEntityId?: string;
}

const THREADS_KEY = chatKeys.threads();
const UNREAD_KEY = chatKeys.unread();
const PRESENCE_KEY = chatKeys.presence();

// ─── Threads + unread badge (polled) ──────────────────────

export function useChatThreads(enabled = true) {
  return useQuery<ChatThread[]>({
    queryKey: THREADS_KEY,
    queryFn: () => apiClient.get<ChatThread[]>('/chat/threads'),
    refetchInterval: enabled ? 20_000 : false,
    enabled,
  });
}

export function useChatThread(threadId: string | null) {
  return useQuery<ChatThread>({
    queryKey: chatKeys.thread(threadId as string),
    queryFn: () => apiClient.get<ChatThread>(`/chat/threads/${threadId}`),
    enabled: !!threadId,
    refetchInterval: 20_000,
  });
}

/** Lichte badge-teller; polt zoals de notificatie-badge (30s). */
export function useChatUnread(enabled = true) {
  return useQuery<ChatUnreadResponse>({
    queryKey: UNREAD_KEY,
    queryFn: () => apiClient.get<ChatUnreadResponse>('/chat/unread'),
    refetchInterval: 30_000,
    enabled,
  });
}

export function useChatUsers(q: string, enabled = true) {
  return useQuery<ChatUser[]>({
    queryKey: chatKeys.users(q),
    queryFn: () =>
      apiClient.get<ChatUser[]>(`/chat/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    staleTime: 30_000,
    enabled,
  });
}

// ─── Mutations ────────────────────────────────────────────

export function useCreateThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateThreadInput) => apiClient.post<ChatThread>('/chat/threads', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: THREADS_KEY }),
  });
}

export function useSendMessage(threadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SendMessageInput) =>
      apiClient.post<ChatMessage>(`/chat/threads/${threadId}/messages`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: THREADS_KEY });
      qc.invalidateQueries({ queryKey: UNREAD_KEY });
    },
  });
}

export function useMarkThreadRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => apiClient.post(`/chat/threads/${threadId}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: THREADS_KEY });
      qc.invalidateQueries({ queryKey: UNREAD_KEY });
    },
  });
}

export function useCloseThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => apiClient.post<ChatThread>(`/chat/threads/${threadId}/close`),
    onSuccess: () => qc.invalidateQueries({ queryKey: THREADS_KEY }),
  });
}

// ─── Presence ─────────────────────────────────────────────

export function usePresence() {
  return useQuery<UserPresence>({
    queryKey: PRESENCE_KEY,
    queryFn: () => apiClient.get<UserPresence>('/users/me/presence'),
  });
}

export function useUpdatePresence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { availability: Availability; availabilityNote?: string }) =>
      apiClient.patch<UserPresence>('/users/me/presence', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRESENCE_KEY });
      qc.invalidateQueries({ queryKey: THREADS_KEY });
    },
  });
}

// ─── Active-thread message polling (since-cursor) ─────────

function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return prev;
  const seen = new Set(prev.map((m) => m.id));
  const added = incoming.filter((m) => !seen.has(m.id));
  return added.length === 0 ? prev : [...prev, ...added];
}

/**
 * Pollt de berichten van de actieve thread incrementeel met `?since=`. Houdt een
 * lokale cursor bij (laatste createdAt) en voegt alleen nieuwe berichten toe.
 */
export function useThreadMessages(threadId: string | null, intervalMs = 10_000) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const activeRef = useRef<string | null>(null);

  const load = useCallback(
    async (reset: boolean) => {
      if (!threadId) return;
      const since = reset ? null : cursorRef.current;
      const qs = since ? `?since=${encodeURIComponent(since)}` : '';
      const data = await apiClient.get<ChatMessage[]>(
        `/chat/threads/${threadId}/messages${qs}`,
      );
      if (activeRef.current !== threadId) return; // thread switched mid-flight
      if (data.length > 0) cursorRef.current = data[data.length - 1].createdAt;
      setMessages((prev) => (reset ? data : mergeMessages(prev, data)));
    },
    [threadId],
  );

  const appendMessage = useCallback((msg: ChatMessage) => {
    cursorRef.current = msg.createdAt;
    setMessages((prev) => mergeMessages(prev, [msg]));
  }, []);

  useEffect(() => {
    activeRef.current = threadId;
    cursorRef.current = null;
    setMessages([]);
    if (!threadId) return;
    setIsLoading(true);
    void load(true).finally(() => {
      if (activeRef.current === threadId) setIsLoading(false);
    });
    const interval = setInterval(() => void load(false), intervalMs);
    return () => clearInterval(interval);
  }, [threadId, load, intervalMs]);

  return { messages, isLoading, reload: () => load(false), appendMessage };
}

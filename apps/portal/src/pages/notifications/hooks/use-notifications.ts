import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  Notification,
  NotificationPref,
  NotificationGroupPref,
  PaginatedResponse,
  NotificationType,
  UnreadCountResponse,
  Role,
} from '@/types';
import type { NotificationModel } from '@/lib/notifications';

// ─── Unread count (polled every 30s for bell badge) ─────

export function useUnreadCount() {
  return useQuery<UnreadCountResponse>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () =>
      apiClient.get<UnreadCountResponse>('/notifications/unread-count'),
    refetchInterval: 30_000,
  });
}

// ─── Recent notifications (polled every 30s for dropdown) ─

export function useRecentNotifications() {
  return useQuery<PaginatedResponse<Notification>>({
    queryKey: ['notifications', 'recent'],
    queryFn: () =>
      apiClient.get<PaginatedResponse<Notification>>(
        '/notifications?limit=10&page=1',
      ),
    refetchInterval: 30_000,
  });
}

// ─── Full paginated list ─────────────────────────────────

interface ListNotificationsParams {
  model?: NotificationModel;
  type?: NotificationType;
  unread?: boolean;
  page?: number;
  limit?: number;
}

export function useNotifications(params: ListNotificationsParams = {}) {
  const qs = new URLSearchParams();
  if (params.model) qs.set('model', params.model);
  if (params.type) qs.set('type', params.type);
  if (params.unread !== undefined) qs.set('unread', String(params.unread));
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));

  const qsStr = qs.toString();
  const endpoint = `/notifications${qsStr ? `?${qsStr}` : ''}`;

  return useQuery<PaginatedResponse<Notification>>({
    queryKey: ['notifications', params],
    queryFn: () =>
      apiClient.get<PaginatedResponse<Notification>>(endpoint),
  });
}

// ─── Mark read (single) ─────────────────────────────────

export function useMarkRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.patch<Notification>(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// ─── Mark all read ──────────────────────────────────────

export function useMarkAllRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// ─── User preferences ───────────────────────────────────

const PREFS_STALE_TIME = 60 * 60 * 1000; // 1 hour — user changes prefs rarely

export function useNotificationPrefs() {
  return useQuery<NotificationPref[]>({
    queryKey: ['notification-prefs'],
    queryFn: () =>
      apiClient.get<NotificationPref[]>('/notification-prefs'),
    staleTime: PREFS_STALE_TIME,
  });
}

interface PrefItem {
  type: NotificationType;
  channelInApp: boolean;
  channelEmail: boolean;
}

export function useSaveNotificationPrefs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (prefs: PrefItem[]) =>
      apiClient.put('/notification-prefs', { prefs }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-prefs'] });
    },
  });
}

// ─── Group preferences (org admin) ──────────────────────

export function useGroupNotificationPrefs() {
  return useQuery<NotificationGroupPref[]>({
    queryKey: ['notification-prefs', 'group'],
    queryFn: () =>
      apiClient.get<NotificationGroupPref[]>('/notification-prefs/group'),
    staleTime: PREFS_STALE_TIME,
  });
}

interface GroupPrefItem {
  role: Role;
  type: NotificationType;
  channelInApp: boolean;
  channelEmail: boolean;
}

export function useSaveGroupNotificationPrefs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (prefs: GroupPrefItem[]) =>
      apiClient.put('/notification-prefs/group', { prefs }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-prefs'] });
    },
  });
}

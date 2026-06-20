import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { User } from '@/types';
import { Role } from '@/types';

export function useUsers(options: { enabled?: boolean } = {}) {
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiClient.get<User[]>('/users'),
    staleTime: 15 * 60 * 1000, // 15 min — user list for dropdowns, rarely changes
    enabled: options.enabled,
  });
}

export function useUser(id: string) {
  return useQuery<User>({
    queryKey: ['users', id],
    queryFn: () => apiClient.get<User>(`/users/${id}`),
    enabled: !!id,
  });
}

/** Lichte gebruiker-shape voor persoon-/team-pickers (REQ5). */
export interface SelectableUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roles: Role[];
}

/**
 * Lichte, org-scoped gebruikerslijst voor pickers. Toegankelijk voor brede
 * rollen (anders dan `useUsers`, dat ORG_ADMIN-only is). Optioneel op rol
 * gefilterd via de backend (`roles hasSome [role]`).
 */
export function useSelectableUsers(role?: Role, options: { enabled?: boolean } = {}) {
  const qs = role ? `?role=${role}` : '';
  return useQuery<SelectableUser[]>({
    queryKey: ['users', 'selectable', role ?? 'all'],
    queryFn: () => apiClient.get<SelectableUser[]>(`/users/selectable${qs}`),
    staleTime: 15 * 60 * 1000,
    enabled: options.enabled,
  });
}

interface InviteUserDto {
  email: string;
  role: Role;
}

export function useInviteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InviteUserDto) =>
      apiClient.post('/users/invite', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.patch(`/users/${userId}/deactivate`),
    onSuccess: (_data, userId) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', userId] });
    },
  });
}

export function useActivateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.patch(`/users/${userId}/activate`),
    onSuccess: (_data, userId) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', userId] });
    },
  });
}

interface ChangeRoleDto {
  userId: string;
  roles: Role[];
}

export function useChangeRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ChangeRoleDto) =>
      apiClient.patch(`/users/${data.userId}/role`, { roles: data.roles }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useAdminResetPassword() {
  return useMutation({
    mutationFn: ({
      userId,
      newPassword,
    }: {
      userId: string;
      newPassword: string;
    }) =>
      apiClient.patch(`/users/${userId}/reset-password`, { newPassword }),
  });
}

interface AdminUpdateUserDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  initials?: string;
  homeStreet?: string | null;
  homeHouseNumber?: string | null;
  homePostalCode?: string | null;
  homeCity?: string | null;
  homeLat?: number | null;
  homeLng?: number | null;
}

export function useAdminUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: AdminUpdateUserDto }) =>
      apiClient.patch(`/users/${userId}`, data),
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', userId] });
    },
  });
}

interface UserRecordCounts {
  contacts: number;
  requests: number;
  tasks: number;
  planningInspectors: number;
  planningSessionInspectors: number;
  planningFollowers: number;
  total: number;
}

export function useUserRecordCounts(userId: string | null) {
  return useQuery<UserRecordCounts>({
    queryKey: ['users', userId, 'record-counts'],
    queryFn: () => apiClient.get<UserRecordCounts>(`/users/${userId}/record-counts`),
    enabled: !!userId,
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, transferToUserId }: { userId: string; transferToUserId: string }) =>
      apiClient.post(`/users/${userId}/delete`, { transferToUserId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

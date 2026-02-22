import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { User } from '@/types';
import { Role } from '@/types';

export function useUsers() {
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiClient.get<User[]>('/users'),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useActivateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.patch(`/users/${userId}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

interface ChangeRoleDto {
  userId: string;
  role: Role;
}

export function useChangeRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ChangeRoleDto) =>
      apiClient.patch(`/users/${data.userId}/role`, { role: data.role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

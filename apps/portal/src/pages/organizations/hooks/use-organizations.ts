import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Organization, User } from '@/types';

export function useOrganizations() {
  return useQuery<Organization[]>({
    queryKey: ['organizations'],
    queryFn: () => apiClient.get<Organization[]>('/organizations'),
  });
}

export function useOrganization(id: string) {
  return useQuery<Organization>({
    queryKey: ['organizations', id],
    queryFn: () => apiClient.get<Organization>(`/organizations/${id}`),
    enabled: !!id,
  });
}

export function useOrganizationUsers(orgId: string) {
  return useQuery<User[]>({
    queryKey: ['organizations', orgId, 'users'],
    queryFn: () => apiClient.get<User[]>(`/organizations/${orgId}/users`),
    enabled: !!orgId,
  });
}

interface CreateOrganizationDto {
  name: string;
  slug: string;
  logoUrl?: string;
  primaryColor?: string;
  defaultVat?: number;
  defaultValidityDays?: number;
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateOrganizationDto) =>
      apiClient.post<Organization>('/organizations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

interface UpdateOrganizationDto {
  name?: string;
  slug?: string;
  primaryColor?: string | null;
  logoUrl?: string;
  defaultVat?: number;
  defaultValidityDays?: number;
}

export function useUpdateOrganization(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateOrganizationDto) =>
      apiClient.patch<Organization>(`/organizations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organizations', id] });
    },
  });
}

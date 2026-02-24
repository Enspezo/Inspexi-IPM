import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Organization } from '@/types';

export function useOrganization(orgId: string | null | undefined) {
  return useQuery<Organization>({
    queryKey: ['organization', orgId],
    queryFn: () => apiClient.get<Organization>(`/organizations/${orgId}`),
    enabled: !!orgId,
  });
}

interface UpdateOrganizationDto {
  name?: string;
  primaryColor?: string | null;
  defaultVat?: number;
  defaultValidityDays?: number;
}

export function useUpdateOrganization(orgId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateOrganizationDto) =>
      apiClient.patch<Organization>(`/organizations/${orgId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', orgId] });
    },
  });
}

export function useUploadLogo(orgId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.upload<{ storageKey: string }>(
        `/organizations/${orgId}/logo`,
        formData,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', orgId] });
      // Ververs de logo URL zodat de cache-busting werkt
      queryClient.invalidateQueries({ queryKey: ['org-logo', orgId] });
    },
  });
}

export function useDeleteLogo(orgId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.delete(`/organizations/${orgId}/logo`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', orgId] });
      queryClient.invalidateQueries({ queryKey: ['org-logo', orgId] });
    },
  });
}

/** Geeft de publieke URL terug van het logo voor een organisatie */
export function getLogoUrl(orgId: string | null | undefined): string | null {
  if (!orgId) return null;
  return `/api/v1/organizations/${orgId}/logo`;
}

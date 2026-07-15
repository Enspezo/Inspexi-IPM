import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ContactDisplayMode, Organization, Role } from '@/types';

export function useOrganization(orgId: string | null | undefined) {
  return useQuery<Organization>({
    queryKey: ['organization', orgId],
    queryFn: () => apiClient.get<Organization>(`/organizations/${orgId}`),
    enabled: !!orgId,
    staleTime: 60 * 60 * 1000, // 1 hour — own org details rarely change
  });
}

interface UpdateOrganizationDto {
  name?: string;
  primaryColor?: string | null;
  defaultVat?: number;
  defaultValidityDays?: number;
  senderName?: string | null;
  senderEmail?: string | null;
  workdayStart?: number;
  workdayEnd?: number;
  inspectorPhoneDisplay?: ContactDisplayMode;
  inspectorEmailDisplay?: ContactDisplayMode;
  inspectorStaticPhone?: string | null;
  inspectorStaticEmail?: string | null;
  quoteApprovalThreshold?: number | null;
  quoteApprovalRequiredRole?: Role | null;
  chatEnabled?: boolean;
  aiAgentEnabled?: boolean;
  aiAgentAllowedRoles?: Role[];
}

export function useUpdateOrganization(orgId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateOrganizationDto) =>
      apiClient.patch<Organization>(`/organizations/${orgId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', orgId] });
      // Branding (incl. chatEnabled) is cached app-wide by TenantProvider — refresh
      // it so toggling e.g. the chat on/off reflects immediately for the admin.
      queryClient.invalidateQueries({ queryKey: ['org-branding'] });
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

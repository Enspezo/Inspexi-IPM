import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import {
  organizationSettingsKeys,
  orgBrandingKeys,
  orgLogoKeys,
} from '@/lib/query-keys';
import type { ContactDisplayMode, Organization, Role } from '@/types';

export function useOrganization(orgId: string | null | undefined) {
  return useQuery<Organization>({
    queryKey: organizationSettingsKeys.detail(orgId as string),
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
}

export function useUpdateOrganization(orgId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (data: UpdateOrganizationDto) =>
      apiClient.patch<Organization>(`/organizations/${orgId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationSettingsKeys.detail(orgId as string) });
      // Branding (incl. chatEnabled) is cached app-wide by TenantProvider — refresh
      // it so toggling e.g. the chat on/off reflects immediately for the admin.
      queryClient.invalidateQueries({ queryKey: orgBrandingKeys.all });
    },
  });
}

export function useUploadLogo(orgId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.upload<{ storageKey: string }>(
        `/organizations/${orgId}/logo`,
        formData,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationSettingsKeys.detail(orgId as string) });
      // Ververs de logo URL zodat de cache-busting werkt
      queryClient.invalidateQueries({ queryKey: orgLogoKeys.byOrg(orgId as string) });
    },
  });
}

export function useDeleteLogo(orgId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: () => apiClient.delete(`/organizations/${orgId}/logo`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationSettingsKeys.detail(orgId as string) });
      queryClient.invalidateQueries({ queryKey: orgLogoKeys.byOrg(orgId as string) });
    },
  });
}

/** Geeft de publieke URL terug van het logo voor een organisatie */
export function getLogoUrl(orgId: string | null | undefined): string | null {
  if (!orgId) return null;
  return `/api/v1/organizations/${orgId}/logo`;
}

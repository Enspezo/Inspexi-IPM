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

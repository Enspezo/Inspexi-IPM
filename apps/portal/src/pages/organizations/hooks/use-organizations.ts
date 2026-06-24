import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Organization, User } from '@/types';
import type {
  FeatureOverrideState,
  OrganizationEntitlements,
} from '@/lib/entitlements';

export function useOrganizations(opts?: { enabled?: boolean }) {
  return useQuery<Organization[]>({
    queryKey: ['organizations'],
    queryFn: () => apiClient.get<Organization[]>('/organizations'),
    staleTime: 15 * 60 * 1000, // 15 min — org list (superuser), rarely changes
    enabled: opts?.enabled ?? true,
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
  chatEnabled?: boolean;
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

// ─── SaaS-abonnementen (entitlements, PRD-09 §5.3) ──────────────────────────

/** Effectieve entitlement-staat van een org (plan, overrides, effectieve set, waarschuwingen). */
export function useOrganizationEntitlements(orgId: string) {
  return useQuery<OrganizationEntitlements>({
    queryKey: ['organization-entitlements', orgId],
    queryFn: () =>
      apiClient.get<OrganizationEntitlements>(`/organizations/${orgId}/entitlements`),
    enabled: !!orgId,
  });
}

/** Na een entitlement-schrijf: ververs de staat + de audit-historie van de org. */
function invalidateEntitlements(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
) {
  queryClient.invalidateQueries({ queryKey: ['organization-entitlements', orgId] });
  queryClient.invalidateQueries({ queryKey: ['audit-logs', 'Organization', orgId] });
}

export function useAssignPlan(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string | null) =>
      apiClient.patch<OrganizationEntitlements>(`/organizations/${orgId}/plan`, {
        planId,
      }),
    onSuccess: () => invalidateEntitlements(queryClient, orgId),
  });
}

export function useSetOrganizationFeature(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      featureKey,
      state,
    }: {
      featureKey: string;
      state: FeatureOverrideState;
    }) =>
      apiClient.put<OrganizationEntitlements>(
        `/organizations/${orgId}/features/${featureKey}`,
        { state },
      ),
    onSuccess: () => invalidateEntitlements(queryClient, orgId),
  });
}

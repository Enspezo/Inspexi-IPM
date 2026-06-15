/**
 * Portal-hooks voor de per-org lookup-tabellen (Fase 1/2). De status/type-velden die
 * LOOKUPS werden (plan/asset/finding/report-status, signatory/signer-types, pass-fail,
 * resolution, client-request-types) komen hier vandaan — NIET uit lib/status.ts.
 * (De lifecycle-ENUMs zoals ChecklistStatus blijven in lib/status.ts.)
 *
 * Render via <LookupBadge kind=… code=… /> (components/ui/lookup-badge.tsx); filteropties
 * van lookup-velden komen dynamisch uit useLookups(kind).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type LookupKind =
  | 'inspection-types' | 'plan-status-types' | 'asset-status-types'
  | 'finding-status-types' | 'report-status-types' | 'signatory-types'
  | 'signer-roles' | 'pass-fail-status-types' | 'resolution-status-types'
  | 'client-request-types' | 'client-request-status-types';

export interface LookupRow {
  id: string;
  orgId: string | null;
  code: string;
  label: string;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
}

/** Gemergede lijst (systeemdefaults + org-overrides) voor een lookup-soort. */
export function useLookups(kind: LookupKind) {
  return useQuery<LookupRow[]>({
    queryKey: ['lookups', kind],
    queryFn: () => apiClient.get<LookupRow[]>(`/lookups/${kind}`),
    staleTime: 5 * 60 * 1000, // lookups veranderen zelden
  });
}

/** Resolve één code → rij (voor losse weergave buiten <LookupBadge>). */
export function useLookupValue(kind: LookupKind, code: string | null | undefined) {
  const { data } = useLookups(kind);
  return code ? data?.find((r) => r.code === code) ?? null : null;
}

// ── Beheer (instellingen-UI): org-overrides toevoegen/bewerken ──
export interface LookupInput {
  code?: string;
  label?: string;
  color?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export function useCreateLookup(kind: LookupKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: LookupInput) => apiClient.post<LookupRow>(`/lookups/${kind}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lookups', kind] }),
  });
}

export function useUpdateLookup(kind: LookupKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: LookupInput }) =>
      apiClient.patch<LookupRow>(`/lookups/${kind}/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lookups', kind] }),
  });
}

export function useDeleteLookup(kind: LookupKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/lookups/${kind}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lookups', kind] }),
  });
}

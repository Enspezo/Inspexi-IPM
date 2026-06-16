/**
 * Client-realm variant van de Beheer-portal `useLookups` (Fase 5). Leest de per-org status/type-
 * tabellen (systeemdefaults + org-overrides, gemerged) via het read-only /client/lookups/:kind
 * endpoint — het staf-/lookups endpoint is @Roles-beveiligd en niet bereikbaar met een client-token.
 *
 * Render via <LookupBadge kind=… code=… /> (components/ui/lookup-badge.tsx).
 */
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type LookupKind =
  | 'inspection-types'
  | 'plan-status-types'
  | 'asset-status-types'
  | 'finding-status-types'
  | 'report-status-types'
  | 'signatory-types'
  | 'signer-roles'
  | 'pass-fail-status-types'
  | 'resolution-status-types'
  | 'client-request-types'
  | 'client-request-status-types';

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
    queryFn: () => apiClient.get<LookupRow[]>(`/client/lookups/${kind}`),
    staleTime: 10 * 60 * 1000, // lookups veranderen zelden
  });
}

/** Resolve één code → rij (voor losse weergave buiten <LookupBadge>). */
export function useLookupValue(kind: LookupKind, code: string | null | undefined) {
  const { data } = useLookups(kind);
  return code ? (data?.find((r) => r.code === code) ?? null) : null;
}

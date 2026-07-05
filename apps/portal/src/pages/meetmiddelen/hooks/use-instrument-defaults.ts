import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { instrumentDefaultKeys } from '@/lib/query-keys';

// ─── Niveau 1 — globale voorkeur van de ingelogde inspecteur ───────────────

export function useMyDefaultInstruments() {
  return useQuery<string[]>({
    queryKey: instrumentDefaultKeys.me(),
    queryFn: () => apiClient.get<string[]>('/measurement-instruments/my-defaults'),
  });
}

export function useSetMyDefaultInstruments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instrumentIds: string[]) =>
      apiClient.put<string[]>('/measurement-instruments/my-defaults', { instrumentIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: instrumentDefaultKeys.me() }),
  });
}

// ─── Niveau 2 — per-inspectie voorkeur ─────────────────────────────────────

export function usePlanDefaultInstruments(planId: string | undefined) {
  return useQuery<string[]>({
    queryKey: instrumentDefaultKeys.plan(planId as string),
    queryFn: () =>
      apiClient.get<string[]>(`/measurement-instruments/plan-defaults/${planId}`),
    enabled: !!planId,
  });
}

export function useSetPlanDefaultInstruments(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instrumentIds: string[]) =>
      apiClient.put<string[]>(`/measurement-instruments/plan-defaults/${planId}`, {
        instrumentIds,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: instrumentDefaultKeys.plan(planId) }),
  });
}

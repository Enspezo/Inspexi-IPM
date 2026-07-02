import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

const KEY = 'instrument-defaults';

// ─── Niveau 1 — globale voorkeur van de ingelogde inspecteur ───────────────

export function useMyDefaultInstruments() {
  return useQuery<string[]>({
    queryKey: [KEY, 'me'],
    queryFn: () => apiClient.get<string[]>('/measurement-instruments/my-defaults'),
  });
}

export function useSetMyDefaultInstruments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instrumentIds: string[]) =>
      apiClient.put<string[]>('/measurement-instruments/my-defaults', { instrumentIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, 'me'] }),
  });
}

// ─── Niveau 2 — per-inspectie voorkeur ─────────────────────────────────────

export function usePlanDefaultInstruments(planId: string | undefined) {
  return useQuery<string[]>({
    queryKey: [KEY, 'plan', planId],
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
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, 'plan', planId] }),
  });
}

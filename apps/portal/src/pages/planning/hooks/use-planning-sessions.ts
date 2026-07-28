import { useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useToast } from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import { planningKeys } from '@/lib/query-keys';
import { makeAvailabilityAwareOnError } from '../lib/availability-warnings';
import type { PlanningSession } from '@/types';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CreateSessionPayload {
  scheduledDate?: string;
  durationHours?: number;
  notes?: string;
}

interface UpdateSessionPayload {
  scheduledDate?: string | null;
  durationHours?: number | null;
  notes?: string | null;
  overrideAvailabilityWarnings?: boolean;
}

interface AssignSessionInspectorsPayload {
  inspectorIds: string[];
  primaryInspectorId?: string;
  overrideAvailabilityWarnings?: boolean;
}

interface RejectSessionPayload {
  reason: string;
}

interface RescheduleSessionPayload {
  reason: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sessionBase(planningItemId: string, sessionId: string) {
  return `/planning/${planningItemId}/sessions/${sessionId}`;
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export function useCreatePlanningSession(planningItemId: string) {
  const qc = useQueryClient();
  return useApiMutation<PlanningSession, Error, CreateSessionPayload>({
    mutationFn: (payload) =>
      apiClient.post<PlanningSession>(`/planning/${planningItemId}/sessions`, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: planningKeys.detail(planningItemId) });
      void qc.invalidateQueries({ queryKey: planningKeys.all });
    },
  });
}

export function useUpdatePlanningSession(planningItemId: string, sessionId: string) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  return useApiMutation<PlanningSession, Error, UpdateSessionPayload>({
    mutationFn: (payload) =>
      apiClient.patch<PlanningSession>(sessionBase(planningItemId, sessionId), payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: planningKeys.detail(planningItemId) });
    },
    // Beschikbaarheids-409 (verzetten sessie) wordt via de override-flow afgehandeld.
    onError: makeAvailabilityAwareOnError(showToast),
  });
}

export function useCancelSession(planningItemId: string, sessionId: string) {
  const qc = useQueryClient();
  return useApiMutation<void, Error, void>({
    mutationFn: () =>
      apiClient.delete<void>(sessionBase(planningItemId, sessionId)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: planningKeys.detail(planningItemId) });
      void qc.invalidateQueries({ queryKey: planningKeys.all });
    },
  });
}

export function useAssignSessionInspectors(planningItemId: string, sessionId: string) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  return useApiMutation<PlanningSession, Error, AssignSessionInspectorsPayload>({
    mutationFn: (payload) =>
      apiClient.post<PlanningSession>(`${sessionBase(planningItemId, sessionId)}/assign`, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: planningKeys.detail(planningItemId) });
      // De backend upsert ook PlanningInspector-rijen op de parent-planregel;
      // die zijn zichtbaar in het overzicht/kalender — dus ook de lijst verversen.
      void qc.invalidateQueries({ queryKey: planningKeys.all });
    },
    // Beschikbaarheids-409 wordt via de override-flow afgehandeld.
    onError: makeAvailabilityAwareOnError(showToast),
  });
}

export function useAcceptSession(planningItemId: string, sessionId: string) {
  const qc = useQueryClient();
  return useApiMutation<void, Error, void>({
    mutationFn: () =>
      apiClient.post<void>(`${sessionBase(planningItemId, sessionId)}/accept`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: planningKeys.detail(planningItemId) });
      void qc.invalidateQueries({ queryKey: planningKeys.all });
    },
  });
}

export function useRejectSession(planningItemId: string, sessionId: string) {
  const qc = useQueryClient();
  return useApiMutation<void, Error, RejectSessionPayload>({
    mutationFn: (payload) =>
      apiClient.post<void>(`${sessionBase(planningItemId, sessionId)}/reject`, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: planningKeys.detail(planningItemId) });
      void qc.invalidateQueries({ queryKey: planningKeys.all });
    },
  });
}

export function useConfirmSession(planningItemId: string, sessionId: string) {
  const qc = useQueryClient();
  return useApiMutation<void, Error, void>({
    mutationFn: () =>
      apiClient.post<void>(`${sessionBase(planningItemId, sessionId)}/confirm`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: planningKeys.detail(planningItemId) });
      void qc.invalidateQueries({ queryKey: planningKeys.all });
    },
  });
}

export function useRescheduleSession(planningItemId: string, sessionId: string) {
  const qc = useQueryClient();
  return useApiMutation<PlanningSession, Error, RescheduleSessionPayload>({
    mutationFn: (payload) =>
      apiClient.post<PlanningSession>(`${sessionBase(planningItemId, sessionId)}/reschedule`, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: planningKeys.detail(planningItemId) });
      void qc.invalidateQueries({ queryKey: planningKeys.all });
    },
  });
}

export function useCompleteSession(planningItemId: string, sessionId: string) {
  const qc = useQueryClient();
  return useApiMutation<void, Error, void>({
    mutationFn: () =>
      apiClient.post<void>(`${sessionBase(planningItemId, sessionId)}/complete`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: planningKeys.detail(planningItemId) });
      void qc.invalidateQueries({ queryKey: planningKeys.all });
    },
  });
}

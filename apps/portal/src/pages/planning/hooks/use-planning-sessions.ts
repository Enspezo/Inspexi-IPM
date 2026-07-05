import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { planningKeys } from '@/lib/query-keys';
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
}

interface AssignSessionInspectorsPayload {
  inspectorIds: string[];
  primaryInspectorId?: string;
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
  return useMutation<PlanningSession, Error, CreateSessionPayload>({
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
  return useMutation<PlanningSession, Error, UpdateSessionPayload>({
    mutationFn: (payload) =>
      apiClient.patch<PlanningSession>(sessionBase(planningItemId, sessionId), payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: planningKeys.detail(planningItemId) });
    },
  });
}

export function useCancelSession(planningItemId: string, sessionId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
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
  return useMutation<PlanningSession, Error, AssignSessionInspectorsPayload>({
    mutationFn: (payload) =>
      apiClient.post<PlanningSession>(`${sessionBase(planningItemId, sessionId)}/assign`, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: planningKeys.detail(planningItemId) });
    },
  });
}

export function useAcceptSession(planningItemId: string, sessionId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
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
  return useMutation<void, Error, RejectSessionPayload>({
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
  return useMutation<void, Error, void>({
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
  return useMutation<PlanningSession, Error, RescheduleSessionPayload>({
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
  return useMutation<void, Error, void>({
    mutationFn: () =>
      apiClient.post<void>(`${sessionBase(planningItemId, sessionId)}/complete`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: planningKeys.detail(planningItemId) });
      void qc.invalidateQueries({ queryKey: planningKeys.all });
    },
  });
}

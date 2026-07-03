import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  ProjectPhase,
  ProjectPhaseFollower,
  PhaseMilestone,
  PhaseStatus,
  MilestoneStatus,
} from '@/types';

// ─── Query keys ────────────────────────────────────────────

const phasesKey = (projectId: string) => ['project-phases', projectId] as const;
const milestonesKey = (projectId: string, phaseId: string) =>
  ['project-phases', projectId, phaseId, 'milestones'] as const;
const followersKey = (projectId: string, phaseId: string) =>
  ['project-phases', projectId, phaseId, 'followers'] as const;

/** Invalidatie die elke fase-mutatie deelt: fasenlijst + het bovenliggende project. */
function invalidatePhaseScope(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
) {
  queryClient.invalidateQueries({ queryKey: phasesKey(projectId) });
  queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
}

// ─── Phases ────────────────────────────────────────────────

export function useProjectPhases(projectId: string) {
  return useQuery({
    queryKey: phasesKey(projectId),
    queryFn: () => apiClient.get<ProjectPhase[]>(`/projects/${projectId}/phases`),
    enabled: !!projectId,
  });
}

export interface CreatePhaseData {
  name: string;
  description?: string;
  status?: PhaseStatus;
  locationId?: string;
  contactPersonId?: string;
  startDate?: string;
  expectedEndDate?: string;
  budgetAmount?: number;
}

export function useCreatePhase(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePhaseData) =>
      apiClient.post<ProjectPhase>(`/projects/${projectId}/phases`, data),
    onSuccess: () => invalidatePhaseScope(queryClient, projectId),
  });
}

export interface UpdatePhaseData {
  name?: string;
  description?: string | null;
  status?: PhaseStatus;
  locationId?: string | null;
  contactPersonId?: string | null;
  startDate?: string | null;
  expectedEndDate?: string | null;
  budgetAmount?: number | null;
}

export function useUpdatePhase(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePhaseData }) =>
      apiClient.patch<ProjectPhase>(`/projects/${projectId}/phases/${id}`, data),
    onSuccess: () => invalidatePhaseScope(queryClient, projectId),
  });
}

export function useDeletePhase(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/projects/${projectId}/phases/${id}`),
    onSuccess: () => invalidatePhaseScope(queryClient, projectId),
  });
}

export function useReorderPhases(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      apiClient.post<ProjectPhase[]>(`/projects/${projectId}/phases/reorder`, {
        orderedIds,
      }),
    onSuccess: () => invalidatePhaseScope(queryClient, projectId),
  });
}

// ─── Milestones ────────────────────────────────────────────

export function usePhaseMilestones(projectId: string, phaseId: string) {
  return useQuery({
    queryKey: milestonesKey(projectId, phaseId),
    queryFn: () =>
      apiClient.get<PhaseMilestone[]>(
        `/projects/${projectId}/phases/${phaseId}/milestones`,
      ),
    enabled: !!projectId && !!phaseId,
  });
}

export interface CreateMilestoneData {
  title: string;
  description?: string;
  dueDate: string;
  assigneeId?: string;
  reminderDaysBefore?: number;
  sortOrder?: number;
}

export function useCreateMilestone(projectId: string, phaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMilestoneData) =>
      apiClient.post<PhaseMilestone>(
        `/projects/${projectId}/phases/${phaseId}/milestones`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: milestonesKey(projectId, phaseId) });
      invalidatePhaseScope(queryClient, projectId);
    },
  });
}

export interface UpdateMilestoneData {
  title?: string;
  description?: string | null;
  dueDate?: string;
  status?: MilestoneStatus;
  assigneeId?: string | null;
  reminderDaysBefore?: number;
  sortOrder?: number;
}

export function useUpdateMilestone(projectId: string, phaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMilestoneData }) =>
      apiClient.patch<PhaseMilestone>(
        `/projects/${projectId}/phases/${phaseId}/milestones/${id}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: milestonesKey(projectId, phaseId) });
      invalidatePhaseScope(queryClient, projectId);
    },
  });
}

export function useDeleteMilestone(projectId: string, phaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(
        `/projects/${projectId}/phases/${phaseId}/milestones/${id}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: milestonesKey(projectId, phaseId) });
      invalidatePhaseScope(queryClient, projectId);
    },
  });
}

// ─── Followers ─────────────────────────────────────────────

export function usePhaseFollowers(projectId: string, phaseId: string) {
  return useQuery({
    queryKey: followersKey(projectId, phaseId),
    queryFn: () =>
      apiClient.get<ProjectPhaseFollower[]>(
        `/projects/${projectId}/phases/${phaseId}/followers`,
      ),
    enabled: !!projectId && !!phaseId,
  });
}

export interface AddPhaseFollowerData {
  userId?: string;
  email?: string;
  name?: string;
  canViewGeneral?: boolean;
  canViewRequests?: boolean;
  canViewQuotes?: boolean;
  canViewPlanning?: boolean;
  canViewDocuments?: boolean;
}

export function useAddPhaseFollower(projectId: string, phaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AddPhaseFollowerData) =>
      apiClient.post<ProjectPhaseFollower>(
        `/projects/${projectId}/phases/${phaseId}/followers`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: followersKey(projectId, phaseId) });
      invalidatePhaseScope(queryClient, projectId);
    },
  });
}

export interface UpdatePhaseFollowerData {
  canViewGeneral?: boolean;
  canViewRequests?: boolean;
  canViewQuotes?: boolean;
  canViewPlanning?: boolean;
  canViewDocuments?: boolean;
}

export function useUpdatePhaseFollower(projectId: string, phaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      followerId,
      data,
    }: {
      followerId: string;
      data: UpdatePhaseFollowerData;
    }) =>
      apiClient.patch<ProjectPhaseFollower>(
        `/projects/${projectId}/phases/${phaseId}/followers/${followerId}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: followersKey(projectId, phaseId) });
    },
  });
}

export function useRemovePhaseFollower(projectId: string, phaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (followerId: string) =>
      apiClient.delete(
        `/projects/${projectId}/phases/${phaseId}/followers/${followerId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: followersKey(projectId, phaseId) });
      invalidatePhaseScope(queryClient, projectId);
    },
  });
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import {
  availabilityTemplateKeys,
  userScheduleKeys,
  availabilityExceptionKeys,
  resolvedAvailabilityKeys,
  availabilityCheckKeys,
  userKeys,
} from '@/lib/query-keys';
import type {
  AvailabilityTemplate,
  UserScheduleAssignment,
  AvailabilityException,
  ResolvedAvailabilityDay,
  AvailabilityCheckResult,
  EmploymentType,
  PaginatedResponse,
} from '@/types';

// ─── Payload-types ──────────────────────────────────────────────────────────

export interface TemplateSlotInput {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface TemplateInput {
  name: string;
  description?: string | null;
  isActive?: boolean;
  slots: TemplateSlotInput[];
}

export interface AssignScheduleInput {
  templateId: string;
  validFrom: string; // YYYY-MM-DD
}

/** Volledige exceptie-payload (create). Voor update mag alles optioneel zijn. */
export interface ExceptionInput {
  userId: string;
  type: AvailabilityException['type'];
  isRecurring: boolean;
  // Eenmalig
  startsAt?: string | null;
  endsAt?: string | null;
  allDay?: boolean;
  // Herhalend
  weekdays?: number[];
  startMinute?: number | null;
  endMinute?: number | null;
  intervalWeeks?: number;
  recurStartDate?: string | null;
  recurEndDate?: string | null;
  reason?: string | null;
}

// ─── Templates ──────────────────────────────────────────────────────────────

export function useAvailabilityTemplates(params: { search?: string; page?: number; limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  qs.set('page', String(params.page ?? 1));
  qs.set('limit', String(params.limit ?? 100));
  const query = qs.toString();
  return useQuery<PaginatedResponse<AvailabilityTemplate>>({
    queryKey: availabilityTemplateKeys.list(params),
    queryFn: () =>
      apiClient.get<PaginatedResponse<AvailabilityTemplate>>(`/availability/templates?${query}`),
  });
}

export function useAvailabilityTemplate(id: string | undefined) {
  return useQuery<AvailabilityTemplate>({
    queryKey: availabilityTemplateKeys.detail(id as string),
    queryFn: () => apiClient.get<AvailabilityTemplate>(`/availability/templates/${id}`),
    enabled: !!id,
  });
}

export function useCreateAvailabilityTemplate() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (input: TemplateInput) =>
      apiClient.post<AvailabilityTemplate>('/availability/templates', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: availabilityTemplateKeys.all }),
  });
}

export function useUpdateAvailabilityTemplate() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<TemplateInput> }) =>
      apiClient.patch<AvailabilityTemplate>(`/availability/templates/${id}`, input),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: availabilityTemplateKeys.all });
      qc.invalidateQueries({ queryKey: availabilityTemplateKeys.detail(id) });
    },
  });
}

export function useDeleteAvailabilityTemplate() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => apiClient.delete(`/availability/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: availabilityTemplateKeys.all }),
  });
}

// ─── Dienstvorm ──────────────────────────────────────────────────────────────

/** Zet de dienstvorm van een inspecteur (PATCH /users/:id, alleen MANAGEMENT_ROLES). */
export function useUpdateEmploymentType(userId: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (employmentType: EmploymentType | null) =>
      apiClient.patch(`/users/${userId}`, { employmentType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.detail(userId) });
      qc.invalidateQueries({ queryKey: userKeys.all });
      qc.invalidateQueries({ queryKey: resolvedAvailabilityKeys.all });
    },
  });
}

// ─── Schema-toewijzingen ─────────────────────────────────────────────────────

export function useUserSchedule(userId: string | undefined, options: { enabled?: boolean } = {}) {
  return useQuery<UserScheduleAssignment[]>({
    queryKey: userScheduleKeys.byUser(userId as string),
    queryFn: () =>
      apiClient.get<UserScheduleAssignment[]>(`/availability/users/${userId}/schedule`),
    enabled: !!userId && (options.enabled ?? true),
  });
}

export function useAssignSchedule(userId: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (input: AssignScheduleInput) =>
      apiClient.put<UserScheduleAssignment>(`/availability/users/${userId}/schedule`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userScheduleKeys.byUser(userId) });
      qc.invalidateQueries({ queryKey: resolvedAvailabilityKeys.all });
    },
  });
}

export function useDeleteScheduleAssignment(userId: string) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (assignmentId: string) =>
      apiClient.delete(`/availability/users/${userId}/schedule/${assignmentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userScheduleKeys.byUser(userId) });
      qc.invalidateQueries({ queryKey: resolvedAvailabilityKeys.all });
    },
  });
}

// ─── Uitzonderingen ──────────────────────────────────────────────────────────

export function useAvailabilityExceptions(
  params: { userId?: string; from?: string; to?: string } = {},
  options: { enabled?: boolean } = {},
) {
  const qs = new URLSearchParams();
  if (params.userId) qs.set('userId', params.userId);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const query = qs.toString();
  return useQuery<AvailabilityException[]>({
    queryKey: availabilityExceptionKeys.list(params),
    queryFn: () =>
      apiClient.get<AvailabilityException[]>(
        `/availability/exceptions${query ? `?${query}` : ''}`,
      ),
    enabled: options.enabled ?? true,
  });
}

export function useCreateAvailabilityException() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (input: ExceptionInput) =>
      apiClient.post<AvailabilityException>('/availability/exceptions', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: availabilityExceptionKeys.all });
      qc.invalidateQueries({ queryKey: resolvedAvailabilityKeys.all });
    },
  });
}

export function useUpdateAvailabilityException() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<Omit<ExceptionInput, 'userId'>> }) =>
      apiClient.patch<AvailabilityException>(`/availability/exceptions/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: availabilityExceptionKeys.all });
      qc.invalidateQueries({ queryKey: resolvedAvailabilityKeys.all });
    },
  });
}

export function useDeleteAvailabilityException() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => apiClient.delete(`/availability/exceptions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: availabilityExceptionKeys.all });
      qc.invalidateQueries({ queryKey: resolvedAvailabilityKeys.all });
    },
  });
}

// ─── Resolved & check (planners) ─────────────────────────────────────────────

export function useResolvedAvailability(
  from: string,
  to: string,
  userIds: string[],
  options: { enabled?: boolean } = {},
) {
  const params = { from, to, userIds };
  return useQuery<ResolvedAvailabilityDay[]>({
    queryKey: resolvedAvailabilityKeys.range(params),
    queryFn: () => {
      const qs = new URLSearchParams({ from, to });
      if (userIds.length) qs.set('userIds', userIds.join(','));
      return apiClient.get<ResolvedAvailabilityDay[]>(`/availability/resolved?${qs.toString()}`);
    },
    enabled: (options.enabled ?? true) && !!from && !!to,
  });
}

export function useAvailabilityCheck(
  params: { userId: string; start: string; end: string },
  options: { enabled?: boolean } = {},
) {
  return useQuery<AvailabilityCheckResult>({
    queryKey: availabilityCheckKeys.query(params),
    queryFn: () => {
      const qs = new URLSearchParams({
        userId: params.userId,
        start: params.start,
        end: params.end,
      });
      return apiClient.get<AvailabilityCheckResult>(`/availability/check?${qs.toString()}`);
    },
    enabled: (options.enabled ?? true) && !!params.userId && !!params.start && !!params.end,
  });
}

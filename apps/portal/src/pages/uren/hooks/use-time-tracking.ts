import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import { timeEntryKeys, timesheetKeys } from '@/lib/query-keys';
import { downloadFromPath } from '@/lib/download-file';
import type {
  ActiveTimer,
  InspectorLocation,
  PaginatedResponse,
  TimeActivityType,
  TimeEntry,
  Timesheet,
  TimesheetStatus,
} from '@/types';

export interface ListTimesheetsParams {
  userId?: string;
  status?: TimesheetStatus;
  year?: number;
  week?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ListTimeEntriesParams {
  userId?: string;
  projectId?: string;
  activityType?: TimeActivityType;
  from?: string;
  to?: string;
  timesheetId?: string;
  timesheetStatus?: TimesheetStatus;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

function toQueryString(params: Record<string, unknown>): string {
  const qp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qp.set(key, String(value));
  }
  const s = qp.toString();
  return s ? `?${s}` : '';
}

export function useTimesheets(params: ListTimesheetsParams = {}) {
  return useQuery({
    queryKey: timesheetKeys.list(params),
    queryFn: () =>
      apiClient.get<PaginatedResponse<Timesheet>>(`/timesheets${toQueryString({ ...params })}`),
  });
}

export function useTimesheet(id: string) {
  return useQuery({
    queryKey: timesheetKeys.detail(id),
    queryFn: () => apiClient.get<Timesheet>(`/timesheets/${id}`),
    enabled: !!id,
  });
}

export function useApproveTimesheet(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: () => apiClient.post<Timesheet>(`/timesheets/${id}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timesheetKeys.all });
    },
  });
}

export function useRejectTimesheet(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (note: string) => apiClient.post<Timesheet>(`/timesheets/${id}/reject`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timesheetKeys.all });
    },
  });
}

export function useTimeEntries(params: ListTimeEntriesParams = {}) {
  return useQuery({
    queryKey: timeEntryKeys.list(params),
    queryFn: () =>
      apiClient.get<PaginatedResponse<TimeEntry>>(`/time-entries${toQueryString({ ...params })}`),
  });
}

export interface UpdateTimeEntryInput {
  activityType?: TimeActivityType;
  projectId?: string | null;
  startedAt?: string;
  endedAt?: string;
  notes?: string | null;
}

export function useUpdateTimeEntry() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTimeEntryInput }) =>
      apiClient.patch<TimeEntry>(`/time-entries/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timesheetKeys.all });
      queryClient.invalidateQueries({ queryKey: timeEntryKeys.all });
    },
  });
}

/** CSV-export met dezelfde filters als de urenregel-lijst (authenticated download). */
export function exportTimeEntriesCsv(params: ListTimeEntriesParams = {}): Promise<void> {
  return downloadFromPath(`/timesheets/export${toQueryString({ ...params })}`, 'urenexport.csv');
}

/** Minuten → "1u 25m" (weergave in totalen en tabellen). */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}u` : `${h}u ${m}m`;
}

// ─── Fase 3: live overzicht + kaart ───────────────────────

export function useActiveTimers() {
  return useQuery({
    queryKey: [...timeEntryKeys.all, 'active'],
    queryFn: () => apiClient.get<ActiveTimer[]>('/time-tracking/active'),
    refetchInterval: 30_000,
  });
}

export function useInspectorLocation(userId: string | null) {
  return useQuery({
    queryKey: [...timeEntryKeys.all, 'location', userId],
    queryFn: () => apiClient.get<InspectorLocation>(`/time-tracking/locations/${userId}/latest`),
    enabled: !!userId,
    refetchInterval: 30_000,
    retry: false,
  });
}

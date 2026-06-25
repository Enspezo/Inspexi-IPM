import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  Calibration,
  MeasurementInstrument,
  MeasurementInstrumentStatus,
  PaginatedResponse,
} from '@/types';

const KEY = 'measurement-instruments';

export interface MeasurementInstrumentDetail extends MeasurementInstrument {
  calibrationCount: number;
  calibrations: Calibration[];
}

/** Velden van het meetmiddel-formulier. `assignedToUserId: null` heft de toewijzing op. */
export interface InstrumentFormValues {
  code: string;
  brand: string;
  type: string;
  serialNumber?: string;
  calibrationIntervalMonths: number;
  status?: MeasurementInstrumentStatus;
  assignedToUserId?: string | null;
  notes?: string;
}

export interface InstrumentListParams {
  search?: string;
  status?: string;
  assignedToUserId?: string;
  calibrationStatus?: string;
  onlyMine?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function useMeetmiddelen(params: InstrumentListParams = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(params.limit ?? 100));
  if (params.page) qs.set('page', String(params.page));
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
  if (params.assignedToUserId) qs.set('assignedToUserId', params.assignedToUserId);
  if (params.calibrationStatus) qs.set('calibrationStatus', params.calibrationStatus);
  if (params.onlyMine) qs.set('onlyMine', 'true');
  if (params.sortBy) qs.set('sortBy', params.sortBy);
  if (params.sortOrder) qs.set('sortOrder', params.sortOrder);
  return useQuery<PaginatedResponse<MeasurementInstrument>>({
    queryKey: [KEY, 'list', params],
    queryFn: () =>
      apiClient.get<PaginatedResponse<MeasurementInstrument>>(
        `/measurement-instruments?${qs.toString()}`,
      ),
  });
}

export function useMeetmiddel(id: string | undefined) {
  return useQuery<MeasurementInstrumentDetail>({
    queryKey: [KEY, 'detail', id],
    queryFn: () => apiClient.get<MeasurementInstrumentDetail>(`/measurement-instruments/${id}`),
    enabled: !!id,
  });
}

/** Distinct autocomplete-waarden voor merk/type (meetmiddel) of uitvoerende instantie. */
export function useInstrumentSuggestions(field: 'brand' | 'type' | 'performedBy') {
  return useQuery<string[]>({
    queryKey: [KEY, 'suggestions', field],
    queryFn: () => apiClient.get<string[]>(`/measurement-instruments/suggestions?field=${field}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateMeetmiddel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: InstrumentFormValues) =>
      apiClient.post<MeasurementInstrument>('/measurement-instruments', values),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateMeetmiddel(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<InstrumentFormValues>) =>
      apiClient.patch<MeasurementInstrument>(`/measurement-instruments/${id}`, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteMeetmiddel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/measurement-instruments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

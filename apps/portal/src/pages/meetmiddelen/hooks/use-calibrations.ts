import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Calibration } from '@/types';

const CAL_KEY = 'calibrations';
const INSTRUMENT_KEY = 'measurement-instruments';

/** Velden van het kalibratie-formulier (datum als ISO yyyy-MM-dd). */
export interface CalibrationFormValues {
  calibrationDate: string;
  performedBy: string;
  certificateNumber?: string;
  notes?: string;
  file?: File | null;
}

function toFormData(values: CalibrationFormValues): FormData {
  const fd = new FormData();
  fd.append('calibrationDate', values.calibrationDate);
  fd.append('performedBy', values.performedBy);
  fd.append('certificateNumber', values.certificateNumber ?? '');
  fd.append('notes', values.notes ?? '');
  if (values.file) fd.append('file', values.file);
  return fd;
}

/** Een kalibratie-mutatie herberekent de cache op het meetmiddel → ook instrument-queries invalideren. */
function invalidate(qc: QueryClient, instrumentId: string) {
  qc.invalidateQueries({ queryKey: [CAL_KEY, instrumentId] });
  qc.invalidateQueries({ queryKey: [INSTRUMENT_KEY] });
}

export function useCalibrations(instrumentId: string | undefined) {
  return useQuery<Calibration[]>({
    queryKey: [CAL_KEY, instrumentId],
    queryFn: () =>
      apiClient.get<Calibration[]>(`/measurement-instruments/${instrumentId}/calibrations`),
    enabled: !!instrumentId,
  });
}

export function useCreateCalibration(instrumentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: CalibrationFormValues) =>
      apiClient.upload<Calibration>(
        `/measurement-instruments/${instrumentId}/calibrations`,
        toFormData(values),
      ),
    onSuccess: () => invalidate(qc, instrumentId),
  });
}

export function useUpdateCalibration(instrumentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ calId, values }: { calId: string; values: CalibrationFormValues }) =>
      apiClient.upload<Calibration>(
        `/measurement-instruments/${instrumentId}/calibrations/${calId}`,
        toFormData(values),
        'PATCH',
      ),
    onSuccess: () => invalidate(qc, instrumentId),
  });
}

export function useDeleteCalibration(instrumentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (calId: string) =>
      apiClient.delete(`/measurement-instruments/${instrumentId}/calibrations/${calId}`),
    onSuccess: () => invalidate(qc, instrumentId),
  });
}

/** Alleen het certificaat verwijderen; de kalibratie blijft bestaan. */
export function useDeleteCalibrationDocument(instrumentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (calId: string) =>
      apiClient.delete<Calibration>(
        `/measurement-instruments/${instrumentId}/calibrations/${calId}/document`,
      ),
    onSuccess: () => invalidate(qc, instrumentId),
  });
}

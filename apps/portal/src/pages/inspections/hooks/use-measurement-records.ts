/**
 * Hooks voor ingevulde meetstaat-records (measurement-sheet-records module).
 * Read-only voor de staf — invullen gebeurt in het veld (PWA).
 *
 * Endpoints:
 *   GET /measurement-sheet-records?assetId=…   → flat array (geen paginatie),
 *                                                 incl. templateSnapshot + data + finalCheckResults
 *   GET /measurement-sheet-records/:id          → één record (incl. snapshot)
 */
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { measurementSheetRecordKeys } from '@/lib/query-keys';
import type { MeasurementSheetRecord } from '@/types';

/** Ingevulde meetstaat-records van één asset. Enabled zodra assetId bekend is. */
export function useAssetMeasurementRecords(assetId: string | undefined) {
  return useQuery<MeasurementSheetRecord[]>({
    queryKey: measurementSheetRecordKeys.byAsset(assetId ?? ''),
    queryFn: () =>
      apiClient.get<MeasurementSheetRecord[]>(`/measurement-sheet-records?assetId=${assetId}`),
    enabled: !!assetId,
  });
}

/**
 * Eén meetstaat-record incl. snapshot + ingevulde waarden. Optioneel: de
 * lijst-endpoint hierboven levert de volledige record (snapshot + data) al mee,
 * dus voor de uitklap in de assets-tab is dit niet nodig. Beschikbaar voor een
 * losstaande detailweergave.
 */
export function useMeasurementRecord(id: string | undefined) {
  return useQuery<MeasurementSheetRecord>({
    queryKey: measurementSheetRecordKeys.detail(id ?? ''),
    queryFn: () => apiClient.get<MeasurementSheetRecord>(`/measurement-sheet-records/${id}`),
    enabled: !!id,
  });
}

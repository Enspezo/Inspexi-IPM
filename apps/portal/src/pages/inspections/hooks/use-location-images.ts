/**
 * Hooks voor de locatie-afbeelding (plattegrond) + markers van een
 * inspectie-locatie. Endpoints (location-images module):
 *   GET    /locations/:locationId/image            → afbeelding + markers
 *   POST   /locations/:locationId/image            → uploaden (multipart 'file')
 *   DELETE /locations/:locationId/image            → verwijderen (markers cascaden)
 *   POST   /location-images/:imageId/markers       → marker aanmaken
 *   PATCH  /location-images/:imageId/markers/:id    → marker bijwerken (positie/label)
 *   DELETE /location-images/:imageId/markers/:id    → marker verwijderen
 *
 * Plus dropdown-data voor het koppelen van een marker aan een bestaande entiteit.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiClientError } from '@/lib/api-client';
import type {
  Asset,
  Finding,
  InspectionLocation,
  LocationImage,
  LocationImageMarker,
  MarkerType,
  StandaloneMeasurement,
} from '@/types';

// ── Locaties van een plan (voor de locatie-selector) ──
export function useInspectionLocations(planId: string | undefined) {
  return useQuery<InspectionLocation[]>({
    queryKey: ['inspection-locations', planId, 'flat'],
    queryFn: () => apiClient.get<InspectionLocation[]>(`/inspection-plans/${planId}/locations?flat=true`),
    enabled: !!planId,
  });
}

// ── Afbeelding + markers van één locatie (404 → null = nog geen afbeelding) ──
export function useLocationImage(locationId: string | undefined) {
  return useQuery<LocationImage | null>({
    queryKey: ['location-image', locationId],
    enabled: !!locationId,
    retry: false,
    queryFn: async () => {
      try {
        return await apiClient.get<LocationImage>(`/locations/${locationId}/image`);
      } catch (err) {
        if (err instanceof ApiClientError && err.statusCode === 404) return null;
        throw err;
      }
    },
  });
}

export function useUploadLocationImage(locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.upload<LocationImage>(`/locations/${locationId}/image`, formData);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['location-image', locationId] }),
  });
}

export function useDeleteLocationImage(locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete(`/locations/${locationId}/image`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['location-image', locationId] }),
  });
}

// ── Markers ──
export interface CreateMarkerInput {
  positionX: number;
  positionY: number;
  markerType: MarkerType;
  assetId?: string;
  findingId?: string;
  standaloneMeasurementId?: string;
  label?: string;
  color?: string;
  icon?: string;
  annotation?: Record<string, unknown>;
}

export interface UpdateMarkerInput {
  positionX?: number;
  positionY?: number;
  label?: string;
  color?: string;
  icon?: string;
  annotation?: Record<string, unknown>;
}

/** locationId alleen om de juiste image-query te invalideren. */
export function useCreateMarker(locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ imageId, data }: { imageId: string; data: CreateMarkerInput }) =>
      apiClient.post<LocationImageMarker>(`/location-images/${imageId}/markers`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['location-image', locationId] }),
  });
}

export function useUpdateMarker(locationId: string) {
  const qc = useQueryClient();
  const key = ['location-image', locationId];
  return useMutation({
    mutationFn: ({ imageId, markerId, data }: { imageId: string; markerId: string; data: UpdateMarkerInput }) =>
      apiClient.patch<LocationImageMarker>(`/location-images/${imageId}/markers/${markerId}`, data),
    // Optimistisch bijwerken zodat slepen niet zichtbaar terugspringt tijdens de refetch.
    onMutate: async ({ markerId, data }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<LocationImage | null>(key);
      if (prev?.markers) {
        qc.setQueryData<LocationImage | null>(key, {
          ...prev,
          markers: prev.markers.map((m) => (m.id === markerId ? { ...m, ...data } : m)),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx && 'prev' in ctx) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteMarker(locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ imageId, markerId }: { imageId: string; markerId: string }) =>
      apiClient.delete(`/location-images/${imageId}/markers/${markerId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['location-image', locationId] }),
  });
}

// ── Dropdown-data voor het koppelen van een marker aan een bestaande entiteit ──
export function useInspectionAssets(planId: string | undefined) {
  return useQuery<Asset[]>({
    queryKey: ['inspection-assets', planId, 'flat'],
    queryFn: () => apiClient.get<Asset[]>(`/inspection-plans/${planId}/assets?flat=true`),
    enabled: !!planId,
  });
}

/** Asset aanmaken onder een plan. Invalideert de plan-asset-lijst (assets-tab + plattegrond). */
export interface CreateAssetInput {
  assetType: string;
  name: string;
  identifier?: string;
  locationDescription?: string;
  parentAssetId?: string;
  notes?: string;
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, data }: { planId: string; data: CreateAssetInput }) =>
      apiClient.post<Asset>(`/inspection-plans/${planId}/assets`, data),
    onSuccess: (_d, { planId }) => {
      qc.invalidateQueries({ queryKey: ['inspection-assets', planId] });
      qc.invalidateQueries({ queryKey: ['inspection-plans', planId] });
      qc.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

export function useStandaloneMeasurements(planId: string | undefined) {
  return useQuery<StandaloneMeasurement[]>({
    queryKey: ['standalone-measurements', planId],
    queryFn: () => apiClient.get<StandaloneMeasurement[]>(`/inspection-plans/${planId}/standalone-measurements`),
    enabled: !!planId,
  });
}

export function useAssetFindings(assetId: string | undefined) {
  return useQuery<Finding[]>({
    queryKey: ['asset-findings', assetId],
    queryFn: () => apiClient.get<Finding[]>(`/assets/${assetId}/findings`),
    enabled: !!assetId,
  });
}

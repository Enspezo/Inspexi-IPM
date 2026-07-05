import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { contactKeys, locationKeys } from '@/lib/query-keys';
import type { Location, PaginatedResponse, PdokRefreshResult } from '@/types';

interface CreateLocationDto {
  name: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  locationTypeId?: string | null;
  notes?: string;
}

export function useAddLocation(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLocationDto) =>
      apiClient.post<Location>(`/contacts/${contactId}/locations`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(contactId) });
      queryClient.invalidateQueries({
        queryKey: contactKeys.locations(contactId),
      });
    },
  });
}

export function useContactLocations(contactId: string) {
  return useQuery<Location[]>({
    queryKey: contactKeys.locations(contactId),
    queryFn: () =>
      apiClient.get<Location[]>(`/contacts/${contactId}/locations`),
    enabled: !!contactId,
  });
}

interface UpdateLocationDto extends Partial<CreateLocationDto> {}

export function useUpdateLocation(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ locationId, data }: { locationId: string; data: UpdateLocationDto }) =>
      apiClient.patch<Location>(`/contacts/locations/${locationId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(contactId) });
      queryClient.invalidateQueries({
        queryKey: contactKeys.locations(contactId),
      });
    },
  });
}

export function useDeleteLocation(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (locationId: string) =>
      apiClient.delete(`/contacts/locations/${locationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(contactId) });
      queryClient.invalidateQueries({
        queryKey: contactKeys.locations(contactId),
      });
    },
  });
}

interface UpdateLocationData extends Partial<CreateLocationDto> {
  pdokData?: Record<string, unknown>;
}

export function useUpdateLocationById() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ locationId, data }: { locationId: string; data: UpdateLocationData }) =>
      apiClient.patch<Location>(`/contacts/locations/${locationId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: locationKeys.all });
    },
  });
}

export function useDeleteLocationById() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (locationId: string) =>
      apiClient.delete(`/contacts/locations/${locationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: locationKeys.all });
    },
  });
}

/**
 * Ververs (of vul) de PDOK/BAG-gegevens van een locatie. Zonder `confirm`
 * worden bij een afwijking de wijzigingen geretourneerd zonder opslaan; met
 * `confirm: true` wordt opgeslagen. Invalidatie alleen bij daadwerkelijk
 * opslaan (`applied`).
 */
export function useRefreshLocationPdok(locationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (confirm: boolean) =>
      apiClient.post<PdokRefreshResult>(
        `/contacts/locations/${locationId}/pdok-refresh`,
        { confirm },
      ),
    onSuccess: (result) => {
      if (result.applied) {
        queryClient.invalidateQueries({ queryKey: locationKeys.all });
        queryClient.invalidateQueries({ queryKey: locationKeys.detail(locationId) });
      }
    },
  });
}

// ─── Locations (global list) ──────────────────────────

interface ListLocationsParams {
  search?: string;
  contactId?: string;
  locationTypeId?: string;
  page?: number;
  limit?: number;
  enabled?: boolean;
}

export function useLocations(params: ListLocationsParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.contactId) queryParams.set('contactId', params.contactId);
  if (params.locationTypeId) queryParams.set('locationTypeId', params.locationTypeId);
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));

  const qs = queryParams.toString();
  const endpoint = `/contacts/locations${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<Location & { contact?: { id: string; type: string; companyName: string | null; firstName: string | null; lastName: string | null } }>>({
    queryKey: locationKeys.list(params),
    queryFn: () => apiClient.get(endpoint),
    enabled: params.enabled,
  });
}

export function useLocation(locationId: string) {
  return useQuery<Location & { contact?: { id: string; type: string; companyName: string | null; firstName: string | null; lastName: string | null } }>({
    queryKey: locationKeys.detail(locationId),
    queryFn: () => apiClient.get(`/contacts/locations/${locationId}`),
    enabled: !!locationId,
  });
}

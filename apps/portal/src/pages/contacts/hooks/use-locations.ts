import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Location, PaginatedResponse } from '@/types';

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
      queryClient.invalidateQueries({ queryKey: ['contacts', contactId] });
      queryClient.invalidateQueries({
        queryKey: ['contacts', contactId, 'locations'],
      });
    },
  });
}

export function useContactLocations(contactId: string) {
  return useQuery<Location[]>({
    queryKey: ['contacts', contactId, 'locations'],
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
      queryClient.invalidateQueries({ queryKey: ['contacts', contactId] });
      queryClient.invalidateQueries({
        queryKey: ['contacts', contactId, 'locations'],
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
      queryClient.invalidateQueries({ queryKey: ['contacts', contactId] });
      queryClient.invalidateQueries({
        queryKey: ['contacts', contactId, 'locations'],
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
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });
}

export function useDeleteLocationById() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (locationId: string) =>
      apiClient.delete(`/contacts/locations/${locationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
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
    queryKey: ['locations', params],
    queryFn: () => apiClient.get(endpoint),
  });
}

export function useLocation(locationId: string) {
  return useQuery<Location & { contact?: { id: string; type: string; companyName: string | null; firstName: string | null; lastName: string | null } }>({
    queryKey: ['locations', locationId],
    queryFn: () => apiClient.get(`/contacts/locations/${locationId}`),
    enabled: !!locationId,
  });
}

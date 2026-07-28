import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import {
  contactPersonLocationKeys,
  locationContactPersonKeys,
} from '@/lib/query-keys';
import type { LocationContactPerson } from '@/types';

// ─── Location–ContactPerson links ─────────────────────

export function useContactPersonLocations(personId: string) {
  return useQuery<(import('@/types').LocationContactPerson & {
    location?: {
      id: string; name: string; street: string; houseNumber: string;
      postalCode: string; city: string; contactId: string;
      locationType?: { id: string; code: string; name: string; color: string | null } | null;
      contact?: { id: string; type: string; companyName: string | null; firstName: string | null; lastName: string | null };
    };
  })[]>({
    queryKey: contactPersonLocationKeys.byPerson(personId),
    queryFn: () => apiClient.get(`/contacts/contact-persons/${personId}/locations`),
    enabled: !!personId,
  });
}

export function useLocationContactPersons(locationId: string) {
  return useQuery<LocationContactPerson[]>({
    queryKey: locationContactPersonKeys.byLocation(locationId),
    queryFn: () => apiClient.get(`/contacts/locations/${locationId}/contact-persons`),
    enabled: !!locationId,
  });
}

export function useLinkContactPerson(locationId: string) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (data: { contactPersonId: string; notes?: string }) =>
      apiClient.post<LocationContactPerson>(`/contacts/locations/${locationId}/contact-persons`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: locationContactPersonKeys.byLocation(locationId) });
    },
  });
}

export function useUpdateLocationContactPerson(linkId: string, locationId: string) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (data: { notes?: string }) =>
      apiClient.patch<LocationContactPerson>(`/contacts/locations/contact-persons/${linkId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: locationContactPersonKeys.byLocation(locationId) });
    },
  });
}

export function useUnlinkContactPerson(locationId: string) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (linkId: string) =>
      apiClient.delete(`/contacts/locations/contact-persons/${linkId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: locationContactPersonKeys.byLocation(locationId) });
    },
  });
}

// ─── ContactPerson–Location links (vanaf de contactpersoon-kant) ──────────

export function useLinkLocationToContactPerson(personId: string) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (data: { locationId: string; notes?: string }) =>
      apiClient.post<LocationContactPerson>(`/contacts/contact-persons/${personId}/locations`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactPersonLocationKeys.byPerson(personId) });
    },
  });
}

export function useUpdateContactPersonLocationNotes(personId: string) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: ({ linkId, notes }: { linkId: string; notes?: string }) =>
      apiClient.patch<LocationContactPerson>(`/contacts/locations/contact-persons/${linkId}`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactPersonLocationKeys.byPerson(personId) });
    },
  });
}

export function useUnlinkLocationFromContactPerson(personId: string) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (linkId: string) =>
      apiClient.delete(`/contacts/locations/contact-persons/${linkId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactPersonLocationKeys.byPerson(personId) });
    },
  });
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import {
  contactKeys,
  contactPersonKeys,
  contactPersonRoleKeys,
} from '@/lib/query-keys';
import type {
  ContactPerson,
  PaginatedResponse,
  ContactPersonRoleOption,
} from '@/types';

// ─── Contact Persons ──────────────────────────────────

interface ListContactPersonsParams {
  contactId?: string;
  search?: string;
  roleId?: string;
  page?: number;
  limit?: number;
}

export function useContactPersons(params: ListContactPersonsParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.contactId) queryParams.set('contactId', params.contactId);
  if (params.search) queryParams.set('search', params.search);
  if (params.roleId) queryParams.set('roleId', params.roleId);
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));

  const qs = queryParams.toString();
  const endpoint = `/contacts/contact-persons${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<ContactPerson>>({
    queryKey: contactPersonKeys.list(params),
    queryFn: () => apiClient.get<PaginatedResponse<ContactPerson>>(endpoint),
  });
}

/** Lookup: actieve contactpersoon-rollen (globaal + org-specifiek). */
export function useContactPersonRoles() {
  return useQuery<ContactPersonRoleOption[]>({
    queryKey: contactPersonRoleKeys.all,
    queryFn: () => apiClient.get<ContactPersonRoleOption[]>('/contacts/contact-person-roles'),
    staleTime: 5 * 60 * 1000,
  });
}

interface CreateContactPersonDto {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  roleId?: string;
  notes?: string;
}

export function useAddContactPerson(contactId: string) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (data: CreateContactPersonDto) =>
      apiClient.post<ContactPerson>(
        `/contacts/${contactId}/contact-persons`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(contactId) });
    },
  });
}

export function useContactPerson(personId: string) {
  return useQuery<ContactPerson>({
    queryKey: contactPersonKeys.detail(personId),
    queryFn: () =>
      apiClient.get<ContactPerson>(`/contacts/contact-persons/${personId}`),
    enabled: !!personId,
  });
}

interface UpdateContactPersonDto extends Partial<CreateContactPersonDto> {}

export function useUpdateContactPerson(personId: string) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (data: UpdateContactPersonDto) =>
      apiClient.patch<ContactPerson>(
        `/contacts/contact-persons/${personId}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.all });
      queryClient.invalidateQueries({ queryKey: contactPersonKeys.detail(personId) });
    },
  });
}

export function useDeleteContactPerson() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (personId: string) =>
      apiClient.delete(`/contacts/contact-persons/${personId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
  });
}

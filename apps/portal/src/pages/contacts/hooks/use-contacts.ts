import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  Contact,
  ContactAddress,
  ContactPerson,
  Location,
  ContactLog,
  ContactEmail,
  PaginatedResponse,
  ContactType,
  ContactPersonRole,
} from '@/types';

interface ListContactsParams {
  search?: string;
  type?: ContactType;
  onlyMine?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function useContacts(params: ListContactsParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.type) queryParams.set('type', params.type);
  if (params.onlyMine) queryParams.set('onlyMine', 'true');
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));
  if (params.sortBy) queryParams.set('sortBy', params.sortBy);
  if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);

  const qs = queryParams.toString();
  const endpoint = `/contacts${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<Contact>>({
    queryKey: ['contacts', params],
    queryFn: () => apiClient.get<PaginatedResponse<Contact>>(endpoint),
  });
}

export function useContact(id: string) {
  return useQuery<Contact>({
    queryKey: ['contacts', id],
    queryFn: () => apiClient.get<Contact>(`/contacts/${id}`),
    enabled: !!id,
  });
}

interface CreateContactDto {
  type: ContactType;
  companyName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  website?: string;
  vatNumber?: string;
  cocNumber?: string;
  notes?: string;
  ownerId?: string;
}

export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateContactDto) =>
      apiClient.post<Contact>('/contacts', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

interface UpdateContactDto extends Partial<CreateContactDto> {}

export function useUpdateContact(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateContactDto) =>
      apiClient.patch<Contact>(`/contacts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

interface CreateAddressDto {
  label: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country?: string;
  isPrimary?: boolean;
  isPostal?: boolean;
  isInvoice?: boolean;
}

export function useAddAddress(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAddressDto) =>
      apiClient.post<ContactAddress>(
        `/contacts/${contactId}/addresses`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', contactId] });
    },
  });
}

interface UpdateAddressDto extends Partial<CreateAddressDto> {}

export function useUpdateAddress(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ addressId, data }: { addressId: string; data: UpdateAddressDto }) =>
      apiClient.patch<ContactAddress>(`/contacts/addresses/${addressId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', contactId] });
    },
  });
}

export function useDeleteAddress(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (addressId: string) =>
      apiClient.delete(`/contacts/addresses/${addressId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', contactId] });
    },
  });
}

interface CreateLocationDto {
  name: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  objectType?: string;
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

interface CreateLogDto {
  type: string;
  subject?: string;
  body?: string;
  loggedAt?: string;
}

export function useAddLog(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLogDto) =>
      apiClient.post<ContactLog>(`/contacts/${contactId}/logs`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', contactId] });
      queryClient.invalidateQueries({
        queryKey: ['contacts', contactId, 'logs'],
      });
    },
  });
}

export function useContactLogs(contactId: string) {
  return useQuery<ContactLog[]>({
    queryKey: ['contacts', contactId, 'logs'],
    queryFn: () =>
      apiClient.get<ContactLog[]>(`/contacts/${contactId}/logs`),
    enabled: !!contactId,
  });
}

interface SendEmailDto {
  subject: string;
  bodyHtml: string;
}

export function useSendEmail(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendEmailDto) =>
      apiClient.post<ContactEmail>(`/contacts/${contactId}/email`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', contactId] });
    },
  });
}

// ─── Contact Persons ──────────────────────────────────

interface ListContactPersonsParams {
  contactId?: string;
  search?: string;
  role?: ContactPersonRole;
  page?: number;
  limit?: number;
}

export function useContactPersons(params: ListContactPersonsParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.contactId) queryParams.set('contactId', params.contactId);
  if (params.search) queryParams.set('search', params.search);
  if (params.role) queryParams.set('role', params.role);
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));

  const qs = queryParams.toString();
  const endpoint = `/contacts/contact-persons${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedResponse<ContactPerson>>({
    queryKey: ['contact-persons', params],
    queryFn: () => apiClient.get<PaginatedResponse<ContactPerson>>(endpoint),
  });
}

interface CreateContactPersonDto {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  role: ContactPersonRole;
  notes?: string;
}

export function useAddContactPerson(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateContactPersonDto) =>
      apiClient.post<ContactPerson>(
        `/contacts/${contactId}/contact-persons`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', contactId] });
    },
  });
}

export function useContactPerson(personId: string) {
  return useQuery<ContactPerson>({
    queryKey: ['contact-persons', personId],
    queryFn: () =>
      apiClient.get<ContactPerson>(`/contacts/contact-persons/${personId}`),
    enabled: !!personId,
  });
}

interface UpdateContactPersonDto extends Partial<CreateContactPersonDto> {}

export function useUpdateContactPerson(personId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateContactPersonDto) =>
      apiClient.patch<ContactPerson>(
        `/contacts/contact-persons/${personId}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact-persons', personId] });
    },
  });
}

export function useDeleteContactPerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (personId: string) =>
      apiClient.delete(`/contacts/contact-persons/${personId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

// ─── Customer Group Assignment ────────────────────────

export function useSetContactGroups(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groupIds: string[]) =>
      apiClient.patch<Contact>(`/contacts/${contactId}/groups`, { groupIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', contactId] });
      queryClient.invalidateQueries({ queryKey: ['customer-groups'] });
    },
  });
}

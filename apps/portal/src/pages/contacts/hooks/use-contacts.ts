import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  Contact,
  ContactAddress,
  Location,
  ContactLog,
  ContactEmail,
  PaginatedResponse,
  ContactType,
} from '@/types';

interface ListContactsParams {
  search?: string;
  type?: ContactType;
  page?: number;
  limit?: number;
}

export function useContacts(params: ListContactsParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.type) queryParams.set('type', params.type);
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));

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

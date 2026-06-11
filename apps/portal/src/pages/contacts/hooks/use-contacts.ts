import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  Contact,
  PaginatedResponse,
  ContactType,
} from '@/types';

// Re-export resource-specific hooks so existing import sites keep working
export * from './use-contact-addresses';
export * from './use-locations';
export * from './use-contact-persons';
export * from './use-contact-logs';
export * from './use-contact-emails';
export * from './use-location-contact-persons';

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

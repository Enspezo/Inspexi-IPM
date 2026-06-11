import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ContactAddress } from '@/types';

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

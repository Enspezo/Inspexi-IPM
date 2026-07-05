import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { numberingSchemeKeys } from '@/lib/query-keys';
import type { NumberingScheme, NumberingModel } from '@/types';

/** All four numbering schemes for the current org (auto-provisioned server-side). */
export function useNumberingSchemes() {
  return useQuery<NumberingScheme[]>({
    queryKey: numberingSchemeKeys.all,
    queryFn: () => apiClient.get<NumberingScheme[]>('/numbering-schemes'),
  });
}

export interface UpdateNumberingSchemeInput {
  prefix?: string;
  suffix?: string;
  mode?: NumberingScheme['mode'];
  start?: number;
  interval?: number;
  digits?: number;
  resetPolicy?: NumberingScheme['resetPolicy'];
  allowManualEntry?: boolean;
  isActive?: boolean;
}

export function useUpdateNumberingScheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ model, data }: { model: NumberingModel; data: UpdateNumberingSchemeInput }) =>
      apiClient.patch<NumberingScheme>(`/numbering-schemes/${model}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: numberingSchemeKeys.all });
    },
  });
}

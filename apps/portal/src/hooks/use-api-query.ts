import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export function useApiQuery<T>(
  queryKey: string[],
  endpoint: string,
  options?: Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<T, Error>({
    queryKey,
    queryFn: () => apiClient.get<T>(endpoint),
    ...options,
  });
}

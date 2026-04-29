import {
  useMutation,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

type HttpMethod = 'post' | 'patch' | 'put' | 'delete';

export function useApiMutation<TData = unknown, TVariables = unknown>(
  endpoint: string | ((variables: TVariables) => string),
  method: HttpMethod = 'post',
  options?: Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'>,
) {
  return useMutation<TData, Error, TVariables>({
    mutationFn: async (variables: TVariables) => {
      const resolvedEndpoint =
        typeof endpoint === 'function' ? endpoint(variables) : endpoint;

      if (method === 'delete') {
        return apiClient.delete<TData>(resolvedEndpoint);
      }

      return apiClient[method]<TData>(resolvedEndpoint, variables);
    },
    ...options,
  });
}

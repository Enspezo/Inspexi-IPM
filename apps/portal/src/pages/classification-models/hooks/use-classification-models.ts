import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ClassificationModel } from '@/types';

export function useClassificationModels() {
  return useQuery<ClassificationModel[]>({
    queryKey: ['classification-models'],
    queryFn: () => apiClient.get<ClassificationModel[]>('/classification-models'),
  });
}

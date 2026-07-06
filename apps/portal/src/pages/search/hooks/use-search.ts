import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { SearchEntityType, SearchResponse } from '@/types';
import { searchKeys } from '@/lib/query-keys';

interface SearchParams {
  q: string;
  type?: SearchEntityType;
  limit?: number;
  page?: number;
}

export function useSearch({ q, type, limit = 4, page = 1 }: SearchParams) {
  const enabled = q.trim().length >= 3;

  const params = new URLSearchParams();
  params.set('q', q.trim());
  if (type) params.set('type', type);
  params.set('limit', String(limit));
  params.set('page', String(page));

  return useQuery<SearchResponse>({
    queryKey: searchKeys.query({ q: q.trim(), type, limit, page }),
    queryFn: () => apiClient.get<SearchResponse>(`/search?${params.toString()}`),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Gedeelde portal-hooks voor de categorie-taxonomie (systeem + org), gebruikt door
 * checklist-items en finding-templates. Categorieën zijn één gedeelde boom; we werken hier
 * met de platte lijst (flat=true). Mirror van lib/lookups.ts.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import type { Category } from '@/types';

export interface UseCategoriesParams {
  /** Platte lijst i.p.v. boom (default true). */
  flat?: boolean;
  /** Systeemcategorieën meenemen (default true). */
  includeSystem?: boolean;
  /** Ook inactieve categorieën (default false). */
  includeInactive?: boolean;
}

export function useCategories(params: UseCategoriesParams = {}) {
  const { flat = true, includeSystem = true, includeInactive = false } = params;
  const qp = new URLSearchParams();
  qp.set('flat', String(flat));
  qp.set('includeSystem', String(includeSystem));
  if (includeInactive) qp.set('includeInactive', 'true');
  const qs = qp.toString();
  return useQuery<Category[]>({
    queryKey: ['categories', { flat, includeSystem, includeInactive }],
    queryFn: () => apiClient.get<Category[]>(`/categories${qs ? `?${qs}` : ''}`),
    staleTime: 5 * 60 * 1000,
  });
}

export interface CategoryInput {
  name?: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  parentId?: string | null;
  isSystem?: boolean;
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (data: CategoryInput) => apiClient.post<Category>('/categories', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, data }: { id: string; data: CategoryInput }) =>
      apiClient.patch<Category>(`/categories/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => apiClient.delete(`/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useReorderCategories() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) =>
      apiClient.post('/categories/reorder', { items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

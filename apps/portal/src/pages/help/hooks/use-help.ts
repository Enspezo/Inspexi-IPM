import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import type {
  HelpArticle,
  HelpArticleStatus,
  HelpCategory,
  PaginatedResponse,
} from '@/types';
import { helpKeys } from '@/lib/query-keys';

interface ArticleListParams {
  categoryId?: string;
  search?: string;
  status?: HelpArticleStatus;
  page?: number;
  limit?: number;
}

function toQuery(p: ArticleListParams): string {
  const q = new URLSearchParams();
  if (p.categoryId) q.set('categoryId', p.categoryId);
  if (p.search) q.set('search', p.search);
  if (p.status) q.set('status', p.status);
  if (p.page) q.set('page', String(p.page));
  if (p.limit) q.set('limit', String(p.limit));
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ── Lezen ──────────────────────────────────────────────────────────────────
export function useHelpCategories() {
  return useQuery<HelpCategory[]>({
    queryKey: helpKeys.categories(),
    queryFn: () => apiClient.get<HelpCategory[]>('/help/categories'),
  });
}

export function useHelpCategory(slug: string) {
  return useQuery<HelpCategory>({
    queryKey: helpKeys.category(slug),
    queryFn: () => apiClient.get<HelpCategory>(`/help/categories/${slug}`),
    enabled: !!slug,
  });
}

export function useHelpArticles(params: ArticleListParams = {}) {
  return useQuery<PaginatedResponse<HelpArticle>>({
    queryKey: helpKeys.articles(params),
    queryFn: () =>
      apiClient.get<PaginatedResponse<HelpArticle>>(
        `/help/articles${toQuery(params)}`,
      ),
  });
}

export function useHelpArticle(slug: string) {
  return useQuery<HelpArticle>({
    queryKey: helpKeys.article(slug),
    queryFn: () => apiClient.get<HelpArticle>(`/help/articles/${slug}`),
    enabled: !!slug,
  });
}

interface ContextualResult {
  items: HelpArticle[];
}

/** Contextuele suggesties (Fase 3) voor de huidige view. */
export function useContextualArticles(moduleKey: string, q?: string, enabled = true) {
  const params = new URLSearchParams();
  if (moduleKey) params.set('module', moduleKey);
  if (q) params.set('q', q);
  const qs = params.toString();
  return useQuery<ContextualResult>({
    queryKey: helpKeys.contextual(moduleKey, q ?? ''),
    queryFn: () =>
      apiClient.get<ContextualResult>(
        `/help/articles/contextual${qs ? `?${qs}` : ''}`,
      ),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useHelpArticleFeedback() {
  return useApiMutation({
    mutationFn: ({ id, helpful }: { id: string; helpful: boolean }) =>
      apiClient.post<{ id: string; helpfulYes: number; helpfulNo: number }>(
        `/help/articles/${id}/feedback`,
        { helpful },
      ),
  });
}

// ── Beheer ─────────────────────────────────────────────────────────────────
export function useAdminHelpArticles(
  params: ArticleListParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<PaginatedResponse<HelpArticle>>({
    queryKey: helpKeys.adminArticles(params),
    queryFn: () =>
      apiClient.get<PaginatedResponse<HelpArticle>>(
        `/help/admin/articles${toQuery(params)}`,
      ),
    enabled: options.enabled ?? true,
  });
}

export function useCreateHelpArticle() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (data: Partial<HelpArticle>) =>
      apiClient.post<HelpArticle>('/help/admin/articles', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: helpKeys.all }),
  });
}

export function useUpdateHelpArticle() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<HelpArticle> }) =>
      apiClient.patch<HelpArticle>(`/help/admin/articles/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: helpKeys.all }),
  });
}

export function usePublishHelpArticle() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) =>
      apiClient.post<HelpArticle>(`/help/admin/articles/${id}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: helpKeys.all }),
  });
}

export function useDeleteHelpArticle() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => apiClient.delete(`/help/admin/articles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: helpKeys.all }),
  });
}

export function useCreateHelpCategory() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (data: Partial<HelpCategory>) =>
      apiClient.post<HelpCategory>('/help/admin/categories', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: helpKeys.all }),
  });
}

export function useUpdateHelpCategory() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<HelpCategory> }) =>
      apiClient.patch<HelpCategory>(`/help/admin/categories/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: helpKeys.all }),
  });
}

export function useDeleteHelpCategory() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => apiClient.delete(`/help/admin/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: helpKeys.all }),
  });
}

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface KbArticleSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  order: number;
}

export interface KbCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  order: number;
  isPublic: boolean;
  articles: KbArticleSummary[];
}

export interface KbArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  category: { id: string; name: string; slug: string } | null;
}

/**
 * publicMode = true → publieke endpoint (zonder login, alleen publieke categorieën).
 * publicMode = false → afgeschermde endpoint (na klant-login, alle externe categorieën).
 */
export function useKbCategories(publicMode: boolean) {
  return useQuery<KbCategory[]>({
    queryKey: ['client-help', 'categories', publicMode],
    queryFn: () =>
      apiClient.get<KbCategory[]>(
        publicMode ? '/client/help/public/categories' : '/client/help/categories',
      ),
  });
}

export function useKbArticle(slug: string | undefined, publicMode: boolean) {
  return useQuery<KbArticle>({
    queryKey: ['client-help', 'article', slug, publicMode],
    queryFn: () =>
      apiClient.get<KbArticle>(
        publicMode
          ? `/client/help/public/articles/${slug}`
          : `/client/help/articles/${slug}`,
      ),
    enabled: !!slug,
  });
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import type {
  FavoritableEntityType,
  FavoriteKey,
  FavoritesResponse,
} from '@/types';
import { favoriteKeys } from '@/lib/query-keys';

/** All favorited (entityType, entityId) keys for the current user — drives star state. */
export function useFavoriteKeys() {
  return useQuery<FavoriteKey[]>({
    queryKey: favoriteKeys.keys(),
    queryFn: () => apiClient.get<FavoriteKey[]>('/favorites/keys'),
  });
}

/** Favorites grouped by entity type, enriched with display names (optionally filtered). */
export function useFavorites(entityType?: FavoritableEntityType) {
  return useQuery<FavoritesResponse>({
    queryKey: favoriteKeys.list(entityType ?? 'all'),
    queryFn: () =>
      apiClient.get<FavoritesResponse>(
        `/favorites${entityType ? `?entityType=${entityType}` : ''}`,
      ),
  });
}

type ToggleArgs = FavoriteKey & { isFavorited: boolean };

/**
 * Add/remove a favorite. Optimistically updates the keys cache so stars flip
 * instantly; rolls back on error and re-syncs both keys + list on settle.
 */
export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: ({ entityType, entityId, isFavorited }: ToggleArgs) =>
      isFavorited
        ? apiClient.delete(
            `/favorites?entityType=${entityType}&entityId=${entityId}`,
          )
        : apiClient.post('/favorites', { entityType, entityId }),
    onMutate: async ({ entityType, entityId, isFavorited }: ToggleArgs) => {
      await queryClient.cancelQueries({ queryKey: favoriteKeys.keys() });
      const previous = queryClient.getQueryData<FavoriteKey[]>(
        favoriteKeys.keys(),
      );
      queryClient.setQueryData<FavoriteKey[]>(
        favoriteKeys.keys(),
        (old = []) =>
          isFavorited
            ? old.filter(
                (k) => !(k.entityType === entityType && k.entityId === entityId),
              )
            : [...old, { entityType, entityId }],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(favoriteKeys.keys(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: favoriteKeys.all });
    },
  });
}

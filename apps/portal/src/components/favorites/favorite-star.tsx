import { clsx } from 'clsx';
import type { FavoritableEntityType } from '@/types';
import {
  useFavoriteKeys,
  useToggleFavorite,
} from '@/pages/favorites/hooks/use-favorites';
import { STAR_PATH } from './favorite-icon';

interface FavoriteStarProps {
  entityType: FavoritableEntityType;
  entityId: string;
  className?: string;
}

/** Toggleable favorite star for any favoritable record. */
export function FavoriteStar({ entityType, entityId, className }: FavoriteStarProps) {
  const { data: keys } = useFavoriteKeys();
  const toggle = useToggleFavorite();

  const isFav = (keys ?? []).some(
    (k) => k.entityType === entityType && k.entityId === entityId,
  );

  const label = isFav ? 'Verwijderen uit favorieten' : 'Toevoegen aan favorieten';

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={isFav}
      disabled={toggle.isPending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate({ entityType, entityId, isFavorited: isFav });
      }}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill={isFav ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.5}
        className={clsx(
          'h-5 w-5',
          isFav ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400',
        )}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={STAR_PATH} />
      </svg>
    </button>
  );
}

import { clsx } from 'clsx';
import type { FavoritableEntityType } from '@/types';
import {
  useFavoriteKeys,
  useToggleFavorite,
} from '@/pages/favorites/hooks/use-favorites';

interface FavoriteStarProps {
  entityType: FavoritableEntityType;
  entityId: string;
  className?: string;
}

const STAR_PATH =
  'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z';

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

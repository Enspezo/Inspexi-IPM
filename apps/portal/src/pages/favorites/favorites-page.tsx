import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { Spinner, useToast } from '@/components/ui';
import { PageHeader } from '@/components/layout/page-header';
import { ENTITY_TYPE_LABELS, getEntityLink } from '@/lib/audit-entity-helpers';
import type { FavoritableEntityType, FavoriteGroup } from '@/types';
import { FavoriteStar } from '@/components/favorites/favorite-star';
import { useFavorites, useToggleFavorite } from './hooks/use-favorites';
import { STAR_PATH } from '@/components/favorites/favorite-icon';

type Filter = FavoritableEntityType | 'all';

function FavoritesGroupSection({ group }: { group: FavoriteGroup }) {
  const toggle = useToggleFavorite();
  const { showToast } = useToast();

  const handleRemove = (entityType: FavoritableEntityType, entityId: string) => {
    toggle.mutate(
      { entityType, entityId, isFavorited: true },
      { onSuccess: () => showToast('Verwijderd uit favorieten', 'success') },
    );
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">
          {ENTITY_TYPE_LABELS[group.entityType] ?? group.entityType}
        </h2>
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          {group.items.length}
        </span>
      </div>
      <ul className="divide-y divide-gray-100">
        {group.items.map((item) => {
          const href = getEntityLink(item.entityType, item.entityId);
          return (
            <li
              key={item.id}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50"
            >
              <FavoriteStar
                entityType={item.entityType}
                entityId={item.entityId}
              />
              {href ? (
                <Link
                  to={href}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-primary-600 hover:text-primary-800 hover:underline"
                  title={item.name}
                >
                  {item.name}
                </Link>
              ) : (
                <span
                  className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900"
                  title={item.name}
                >
                  {item.name}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleRemove(item.entityType, item.entityId)}
                disabled={toggle.isPending}
                className="shrink-0 text-xs font-medium text-gray-400 transition-colors hover:text-danger-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Verwijderen uit favorieten
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function FavoritesPage() {
  const { data, isLoading } = useFavorites();
  const [filter, setFilter] = useState<Filter>('all');

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const groups = data?.groups ?? [];
  const hasFavorites = groups.some((g) => g.items.length > 0);
  const presentTypes = groups
    .filter((g) => g.items.length > 0)
    .map((g) => g.entityType);

  const shownGroups =
    filter === 'all' ? groups : groups.filter((g) => g.entityType === filter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Favorieten"
        description="Je gemarkeerde records, gegroepeerd per type."
      />

      {!hasFavorites ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="mb-4 h-12 w-12 text-gray-300"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={STAR_PATH} />
          </svg>
          <p className="text-base font-medium text-gray-700">
            Nog geen favorieten
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Markeer records met het sterretje.
          </p>
        </div>
      ) : (
        <>
          {/* Type filter chips */}
          <div className="flex flex-wrap gap-2">
            <FilterChip
              label="Alle"
              active={filter === 'all'}
              onClick={() => setFilter('all')}
            />
            {presentTypes.map((type) => (
              <FilterChip
                key={type}
                label={ENTITY_TYPE_LABELS[type] ?? type}
                active={filter === type}
                onClick={() => setFilter(type)}
              />
            ))}
          </div>

          <div className="space-y-4">
            {shownGroups
              .filter((g) => g.items.length > 0)
              .map((group) => (
                <FavoritesGroupSection key={group.entityType} group={group} />
              ))}
          </div>
        </>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
        active
          ? 'border-primary-500 bg-primary-50 text-primary-700'
          : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
      )}
    >
      {label}
    </button>
  );
}

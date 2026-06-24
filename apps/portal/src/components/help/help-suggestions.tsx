import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useContextualArticles } from '@/pages/help/hooks/use-help';

const MAX_VISIBLE = 5;

interface Props {
  moduleKey: string;
  q?: string;
  onNavigate?: () => void;
}

export function HelpSuggestions({ moduleKey, q, onNavigate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useContextualArticles(moduleKey, q);

  if (isLoading) {
    return (
      <div className="py-4">
        <Spinner size="sm" />
      </div>
    );
  }

  const items = data?.items ?? [];
  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, MAX_VISIBLE);
  const hiddenCount = items.length - MAX_VISIBLE;

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Relevante artikelen
      </h3>
      <ul className="space-y-1">
        {visible.map((a) => (
          <li key={a.id}>
            <Link
              to={`/help/article/${a.slug}`}
              onClick={onNavigate}
              className="block rounded px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-50 hover:text-primary-600"
            >
              {a.title}
              {a.orgId && (
                <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                  eigen org
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {!expanded && hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-1 px-2 text-sm font-medium text-primary-600 hover:underline"
        >
          Meer ({hiddenCount})
        </button>
      )}
    </div>
  );
}

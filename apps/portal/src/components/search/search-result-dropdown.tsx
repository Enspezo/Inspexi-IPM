import { Link, useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useSearch } from '@/pages/search/hooks/use-search';
import type {
  SearchEntityType,
  SearchGroup,
  SearchResultItem,
  SearchContactResult,
  SearchContactPersonResult,
  SearchLocationResult,
  SearchRequestResult,
  SearchQuoteResult,
  SearchTaskResult,
  SearchDocumentResult,
  SearchProductResult,
} from '@/types';

interface Props {
  query: string;
  onClose: () => void;
}

const GROUP_LABELS: Record<SearchEntityType, string> = {
  contact: 'Relaties',
  contactPerson: 'Contactpersonen',
  location: 'Locaties',
  request: 'Aanvragen',
  quote: 'Offertes',
  task: 'Taken',
  document: 'Documenten',
  product: 'Producten',
};

function getItemRoute(type: SearchEntityType, item: SearchResultItem): string {
  switch (type) {
    case 'contact':
      return `/contacts/${(item as SearchContactResult).id}`;
    case 'contactPerson':
      return `/contacts/${(item as SearchContactPersonResult).contactId}`;
    case 'location':
      return `/contacts/${(item as SearchLocationResult).contactId}`;
    case 'request':
      return `/requests/${(item as SearchRequestResult).id}`;
    case 'quote':
      return `/quotes/${(item as SearchQuoteResult).id}`;
    case 'task':
      return `/tasks/${(item as SearchTaskResult).id}`;
    case 'document':
      return `/documents`;
    case 'product':
      return `/products/${(item as SearchProductResult).id}`;
  }
}

function getItemLabel(type: SearchEntityType, item: SearchResultItem): string {
  switch (type) {
    case 'contact': {
      const c = item as SearchContactResult;
      return c.companyName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
    }
    case 'contactPerson': {
      const p = item as SearchContactPersonResult;
      return `${p.firstName} ${p.lastName}`;
    }
    case 'location': {
      const l = item as SearchLocationResult;
      return l.name;
    }
    case 'request':
      return (item as SearchRequestResult).title;
    case 'quote': {
      const q = item as SearchQuoteResult;
      return `${q.quoteNumber} — ${q.subject}`;
    }
    case 'task':
      return (item as SearchTaskResult).title;
    case 'document':
      return (item as SearchDocumentResult).originalName;
    case 'product':
      return (item as SearchProductResult).name;
  }
}

function getItemSubtitle(
  type: SearchEntityType,
  item: SearchResultItem,
): string | null {
  switch (type) {
    case 'contactPerson': {
      const p = item as SearchContactPersonResult;
      return (
        p.contact.companyName ||
        [p.contact.firstName, p.contact.lastName].filter(Boolean).join(' ') ||
        null
      );
    }
    case 'location': {
      const l = item as SearchLocationResult;
      const address = `${l.street} ${l.houseNumber}, ${l.city}`;
      const contactName =
        l.contact.companyName ||
        [l.contact.firstName, l.contact.lastName].filter(Boolean).join(' ');
      return contactName ? `${address} — ${contactName}` : address;
    }
    case 'request': {
      const r = item as SearchRequestResult;
      return (
        r.contact.companyName ||
        [r.contact.firstName, r.contact.lastName].filter(Boolean).join(' ') ||
        null
      );
    }
    case 'quote': {
      const q = item as SearchQuoteResult;
      return (
        q.contact.companyName ||
        [q.contact.firstName, q.contact.lastName].filter(Boolean).join(' ') ||
        null
      );
    }
    case 'task':
      return (item as SearchTaskResult).entityName;
    case 'document':
      return (item as SearchDocumentResult).entityName;
    case 'product': {
      const p = item as SearchProductResult;
      return p.productGroup?.name ?? null;
    }
    default:
      return null;
  }
}

function ResultGroup({
  group,
  query,
  onClose,
}: {
  group: SearchGroup;
  query: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const hasMore = group.total > group.items.length;

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {GROUP_LABELS[group.type]}
        </span>
        {hasMore && (
          <Link
            to={`/search?q=${encodeURIComponent(query)}&type=${group.type}`}
            onClick={onClose}
            className="text-xs text-primary-600 hover:text-primary-800"
          >
            Volledig resultaat ({group.total})
          </Link>
        )}
      </div>

      {group.items.map((item) => {
        const id = (item as any).id as string;
        const label = getItemLabel(group.type, item);
        const subtitle = getItemSubtitle(group.type, item);
        const route = getItemRoute(group.type, item);

        return (
          <button
            key={id}
            onClick={() => {
              navigate(route);
              onClose();
            }}
            className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{label}</p>
              {subtitle && (
                <p className="truncate text-xs text-gray-500">{subtitle}</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function SearchResultDropdown({ query, onClose }: Props) {
  const { data, isLoading } = useSearch({ q: query, limit: 4 });

  const nonEmptyGroups = data?.groups.filter((g) => g.total > 0) ?? [];
  const hasResults = nonEmptyGroups.length > 0;

  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Spinner size="sm" />
        </div>
      )}

      {!isLoading && !hasResults && (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          Geen resultaten gevonden voor &ldquo;{query}&rdquo;
        </div>
      )}

      {!isLoading &&
        nonEmptyGroups.map((group) => (
          <ResultGroup
            key={group.type}
            group={group}
            query={query}
            onClose={onClose}
          />
        ))}

      {!isLoading && hasResults && (
        <div className="border-t border-gray-100 px-4 py-2.5">
          <Link
            to={`/search?q=${encodeURIComponent(query)}`}
            onClick={onClose}
            className="block text-center text-sm font-medium text-primary-600 hover:text-primary-800"
          >
            Alle resultaten bekijken
          </Link>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { Table, type Column, Spinner } from '@/components/ui';
import { useSearch } from './hooks/use-search';
import type {
  SearchEntityType,
  SearchContactResult,
  SearchContactPersonResult,
  SearchLocationResult,
  SearchRequestResult,
  SearchQuoteResult,
  SearchTaskResult,
  SearchDocumentResult,
  SearchProductResult,
  SearchResultItem,
} from '@/types';
import { Role, RequestStatus, QuoteStatus, TaskStatus } from '@/types';
import { hasRole } from '@/lib/has-role';

// ─── Status / label helpers ──────────────────────────────

const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  NIEUW: 'Nieuw',
  IN_BEHANDELING: 'In behandeling',
  OFFERTE_GEMAAKT: 'Offerte gemaakt',
  GEWONNEN: 'Gewonnen',
  VERLOREN: 'Verloren',
  ON_HOLD: 'On hold',
};

const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  CONCEPT: 'Concept',
  TER_GOEDKEURING: 'Ter goedkeuring',
  GOEDGEKEURD: 'Goedgekeurd',
  VERSTUURD: 'Verstuurd',
  BEKEKEN: 'Bekeken',
  GEACCEPTEERD: 'Geaccepteerd',
  AFGEWEZEN: 'Afgewezen',
  VERLOPEN: 'Verlopen',
};

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TE_DOEN: 'Te doen',
  MEE_BEZIG: 'Mee bezig',
  VOLTOOID: 'Voltooid',
};

function contactDisplayName(c: {
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  return (
    c.companyName ||
    [c.firstName, c.lastName].filter(Boolean).join(' ') ||
    '—'
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL');
}

// ─── Tab config ──────────────────────────────────────────

const TAB_ORDER: SearchEntityType[] = [
  'contact',
  'contactPerson',
  'location',
  'request',
  'quote',
  'task',
  'document',
  'product',
];

const TAB_LABELS: Record<SearchEntityType, string> = {
  contact: 'Relaties',
  contactPerson: 'Contactpersonen',
  location: 'Locaties',
  request: 'Aanvragen',
  quote: 'Offertes',
  task: 'Taken',
  document: 'Documenten',
  product: 'Producten',
};

// ─── Per-tab table columns ────────────────────────────────

function useContactColumns(): Column<SearchContactResult>[] {
  return [
    {
      key: 'name',
      header: 'Naam',
      render: (c) => (
        <Link
          to={`/contacts/${c.id}`}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {contactDisplayName(c)}
        </Link>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (c) => (c.type === 'COMPANY' ? 'Bedrijf' : 'Particulier'),
    },
    {
      key: 'email',
      header: 'E-mail',
      render: (c) => c.email ?? '—',
    },
    {
      key: 'phone',
      header: 'Telefoon',
      render: (c) => c.phone ?? '—',
    },
    {
      key: 'city',
      header: 'Stad',
      render: (c) => c.addresses[0]?.city ?? '—',
    },
  ];
}

function useContactPersonColumns(): Column<SearchContactPersonResult>[] {
  return [
    {
      key: 'name',
      header: 'Naam',
      render: (p) => (
        <Link
          to={`/contacts/${p.contactId}`}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {p.firstName} {p.lastName}
        </Link>
      ),
    },
    {
      key: 'role',
      header: 'Functie',
      render: (p) => p.role?.label ?? '—',
    },
    {
      key: 'email',
      header: 'E-mail',
      render: (p) => p.email ?? '—',
    },
    {
      key: 'contact',
      header: 'Relatie',
      render: (p) => (
        <Link
          to={`/contacts/${p.contact.id}`}
          className="text-primary-600 hover:text-primary-800 hover:underline"
        >
          {contactDisplayName(p.contact)}
        </Link>
      ),
    },
  ];
}

function useLocationColumns(): Column<SearchLocationResult>[] {
  return [
    {
      key: 'name',
      header: 'Naam',
      render: (l) => (
        <Link
          to={`/contacts/${l.contactId}`}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {l.name}
        </Link>
      ),
    },
    {
      key: 'address',
      header: 'Adres',
      render: (l) => `${l.street} ${l.houseNumber}`,
    },
    {
      key: 'postalCode',
      header: 'Postcode',
      render: (l) => l.postalCode,
    },
    {
      key: 'city',
      header: 'Stad',
      render: (l) => l.city,
    },
    {
      key: 'objectType',
      header: 'Objecttype',
      render: (l) => l.objectType ?? '—',
    },
    {
      key: 'contact',
      header: 'Relatie',
      render: (l) => (
        <Link
          to={`/contacts/${l.contact.id}`}
          className="text-primary-600 hover:text-primary-800 hover:underline"
        >
          {contactDisplayName(l.contact)}
        </Link>
      ),
    },
  ];
}

function useRequestColumns(): Column<SearchRequestResult>[] {
  return [
    {
      key: 'title',
      header: 'Titel',
      render: (r) => (
        <Link
          to={`/requests/${r.id}`}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {r.title}
        </Link>
      ),
    },
    {
      key: 'contact',
      header: 'Relatie',
      render: (r) => contactDisplayName(r.contact),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => REQUEST_STATUS_LABELS[r.status] ?? r.status,
    },
    {
      key: 'createdAt',
      header: 'Aangemaakt',
      render: (r) => formatDate(r.createdAt),
    },
  ];
}

function useQuoteColumns(): Column<SearchQuoteResult>[] {
  return [
    {
      key: 'number',
      header: 'Nummer',
      render: (q) => (
        <Link
          to={`/quotes/${q.id}`}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {q.quoteNumber}
        </Link>
      ),
    },
    {
      key: 'subject',
      header: 'Onderwerp',
      render: (q) => q.subject,
    },
    {
      key: 'contact',
      header: 'Relatie',
      render: (q) => contactDisplayName(q.contact),
    },
    {
      key: 'status',
      header: 'Status',
      render: (q) => QUOTE_STATUS_LABELS[q.status] ?? q.status,
    },
    {
      key: 'total',
      header: 'Totaal',
      render: (q) => formatCurrency(q.total),
    },
    {
      key: 'createdAt',
      header: 'Aangemaakt',
      render: (q) => formatDate(q.createdAt),
    },
  ];
}

function useTaskColumns(): Column<SearchTaskResult>[] {
  return [
    {
      key: 'title',
      header: 'Titel',
      render: (t) => (
        <Link
          to={`/tasks/${t.id}`}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {t.title}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => TASK_STATUS_LABELS[t.status] ?? t.status,
    },
    {
      key: 'entity',
      header: 'Gekoppeld aan',
      render: (t) => t.entityName ?? '—',
    },
    {
      key: 'assignee',
      header: 'Toegewezen',
      render: (t) =>
        t.assignee
          ? `${t.assignee.firstName} ${t.assignee.lastName}`
          : '—',
    },
    {
      key: 'deadline',
      header: 'Deadline',
      render: (t) => (t.deadline ? formatDate(t.deadline) : '—'),
    },
  ];
}

function useDocumentColumns(): Column<SearchDocumentResult>[] {
  return [
    {
      key: 'name',
      header: 'Bestandsnaam',
      render: (d) => (
        <Link
          to={`/documents`}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {d.originalName}
        </Link>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (d) => {
        const parts = d.mimeType.split('/');
        return parts[parts.length - 1].toUpperCase();
      },
    },
    {
      key: 'entity',
      header: 'Entiteit',
      render: (d) => d.entityName ?? '—',
    },
    {
      key: 'uploadedBy',
      header: 'Geüpload door',
      render: (d) => `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}`,
    },
    {
      key: 'createdAt',
      header: 'Datum',
      render: (d) => formatDate(d.createdAt),
    },
  ];
}

function useProductColumns(): Column<SearchProductResult>[] {
  return [
    {
      key: 'name',
      header: 'Naam',
      render: (p) => (
        <Link
          to={`/products/${p.id}`}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {p.name}
        </Link>
      ),
    },
    {
      key: 'group',
      header: 'Groep',
      render: (p) => p.productGroup?.name ?? '—',
    },
    {
      key: 'unit',
      header: 'Eenheid',
      render: (p) => p.unit,
    },
    {
      key: 'active',
      header: 'Actief',
      render: (p) => (p.isActive ? 'Ja' : 'Nee'),
    },
  ];
}

// ─── Tab content renderer ────────────────────────────────

function TabContent({
  type,
  items,
  isLoading,
  total,
  page,
  limit,
  onPageChange,
}: {
  type: SearchEntityType;
  items: SearchResultItem[];
  isLoading: boolean;
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
}) {
  const contactColumns = useContactColumns();
  const contactPersonColumns = useContactPersonColumns();
  const locationColumns = useLocationColumns();
  const requestColumns = useRequestColumns();
  const quoteColumns = useQuoteColumns();
  const taskColumns = useTaskColumns();
  const documentColumns = useDocumentColumns();
  const productColumns = useProductColumns();

  const totalPages = Math.ceil(total / limit);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  function renderTable() {
    switch (type) {
      case 'contact':
        return (
          <Table<SearchContactResult>
            columns={contactColumns}
            data={items as SearchContactResult[]}
            keyExtractor={(c) => c.id}
            emptyMessage="Geen relaties gevonden"
          />
        );
      case 'contactPerson':
        return (
          <Table<SearchContactPersonResult>
            columns={contactPersonColumns}
            data={items as SearchContactPersonResult[]}
            keyExtractor={(p) => p.id}
            emptyMessage="Geen contactpersonen gevonden"
          />
        );
      case 'location':
        return (
          <Table<SearchLocationResult>
            columns={locationColumns}
            data={items as SearchLocationResult[]}
            keyExtractor={(l) => l.id}
            emptyMessage="Geen locaties gevonden"
          />
        );
      case 'request':
        return (
          <Table<SearchRequestResult>
            columns={requestColumns}
            data={items as SearchRequestResult[]}
            keyExtractor={(r) => r.id}
            emptyMessage="Geen aanvragen gevonden"
          />
        );
      case 'quote':
        return (
          <Table<SearchQuoteResult>
            columns={quoteColumns}
            data={items as SearchQuoteResult[]}
            keyExtractor={(q) => q.id}
            emptyMessage="Geen offertes gevonden"
          />
        );
      case 'task':
        return (
          <Table<SearchTaskResult>
            columns={taskColumns}
            data={items as SearchTaskResult[]}
            keyExtractor={(t) => t.id}
            emptyMessage="Geen taken gevonden"
          />
        );
      case 'document':
        return (
          <Table<SearchDocumentResult>
            columns={documentColumns}
            data={items as SearchDocumentResult[]}
            keyExtractor={(d) => d.id}
            emptyMessage="Geen documenten gevonden"
          />
        );
      case 'product':
        return (
          <Table<SearchProductResult>
            columns={productColumns}
            data={items as SearchProductResult[]}
            keyExtractor={(p) => p.id}
            emptyMessage="Geen producten gevonden"
          />
        );
    }
  }

  return (
    <div className="space-y-4">
      {renderTable()}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} van {total} resultaten
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Vorige
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Volgende
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────

const LIMIT = 20;

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const q = searchParams.get('q') ?? '';
  const typeParam = searchParams.get('type') as SearchEntityType | null;
  const [page, setPage] = useState(1);

  // Reset page when q or type changes
  useEffect(() => {
    setPage(1);
  }, [q, typeParam]);

  const canSeeProducts = !hasRole(user, Role.INSPECTEUR);

  const visibleTabOrder = TAB_ORDER.filter((t) => {
    if (t === 'product' && !canSeeProducts) return false;
    return true;
  });

  // Preview call — gives us totals for all tabs
  const { data: previewData, isLoading: isPreviewLoading } = useSearch({
    q,
    limit: 4,
  });

  // Determine active type: from URL, or default to first tab with results
  const firstTypeWithResults = visibleTabOrder.find((t) =>
    previewData?.groups.some((g) => g.type === t && g.total > 0),
  );
  const activeType: SearchEntityType | null = typeParam ?? firstTypeWithResults ?? null;

  // Paginated call for active tab
  const { data: tabData, isLoading: isTabLoading } = useSearch({
    q,
    type: activeType ?? undefined,
    limit: LIMIT,
    page,
  });

  const activeGroup = tabData?.groups.find((g) => g.type === activeType);

  const handleTabChange = (type: SearchEntityType) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('type', type);
      return next;
    });
    setPage(1);
  };

  const hasAnyResults = previewData?.groups.some((g) => g.total > 0);

  if (!q) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <svg
          className="mb-4 h-12 w-12 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <p className="text-gray-500">Typ iets in de zoekbalk om te zoeken</p>
      </div>
    );
  }

  if (isPreviewLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Zoekresultaten voor &ldquo;{q}&rdquo;
        </h1>
        {hasAnyResults && (
          <p className="mt-1 text-sm text-gray-500">
            {previewData?.groups
              .filter((g) => g.total > 0)
              .map((g) => `${g.total} ${TAB_LABELS[g.type].toLowerCase()}`)
              .join(', ')}
          </p>
        )}
      </div>

      {/* No results */}
      {!hasAnyResults && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
          <svg
            className="mb-4 h-10 w-10 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <p className="text-base font-medium text-gray-700">
            Geen resultaten gevonden
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Probeer een andere zoekterm of controleer de spelling
          </p>
        </div>
      )}

      {/* Tabs + Table */}
      {hasAnyResults && activeType && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {/* Tabs */}
          <div className="border-b border-gray-200 px-6">
            <nav className="-mb-px flex gap-1" aria-label="Zoektabs">
              {visibleTabOrder.map((type) => {
                const group = previewData?.groups.find((g) => g.type === type);
                if (!group || group.total === 0) return null;
                const isActive = activeType === type;
                return (
                  <button
                    key={type}
                    onClick={() => handleTabChange(type)}
                    className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-primary-500 text-primary-600'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    {TAB_LABELS[type]}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        isActive
                          ? 'bg-primary-100 text-primary-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {group.total}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab content */}
          <div className="p-6">
            <TabContent
              type={activeType}
              items={activeGroup?.items ?? []}
              isLoading={isTabLoading}
              total={activeGroup?.total ?? 0}
              page={page}
              limit={LIMIT}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}
    </div>
  );
}

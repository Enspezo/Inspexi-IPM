import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QuoteStatus, Role } from '@/types';
import type { Quote } from '@/types';
import {
  ActionMenu,
  Button,
  Spinner,
  Table,
  Input,
  Select,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useAuth } from '@/providers/auth-provider';
import { useQuotes } from './hooks/use-quotes';

const statusFilterOptions = [
  { value: '', label: 'Alle statussen' },
  { value: QuoteStatus.CONCEPT, label: 'Concept' },
  { value: QuoteStatus.TER_GOEDKEURING, label: 'Ter goedkeuring' },
  { value: QuoteStatus.GOEDGEKEURD, label: 'Goedgekeurd' },
  { value: QuoteStatus.VERSTUURD, label: 'Verstuurd' },
  { value: QuoteStatus.BEKEKEN, label: 'Bekeken' },
  { value: QuoteStatus.GEACCEPTEERD, label: 'Geaccepteerd' },
  { value: QuoteStatus.AFGEWEZEN, label: 'Afgewezen' },
  { value: QuoteStatus.VERLOPEN, label: 'Verlopen' },
];

const statusColors: Record<string, string> = {
  [QuoteStatus.CONCEPT]: 'bg-gray-100 text-gray-800',
  [QuoteStatus.TER_GOEDKEURING]: 'bg-yellow-100 text-yellow-800',
  [QuoteStatus.GOEDGEKEURD]: 'bg-green-100 text-green-800',
  [QuoteStatus.VERSTUURD]: 'bg-blue-100 text-blue-800',
  [QuoteStatus.BEKEKEN]: 'bg-purple-100 text-purple-800',
  [QuoteStatus.GEACCEPTEERD]: 'bg-emerald-100 text-emerald-800',
  [QuoteStatus.AFGEWEZEN]: 'bg-red-100 text-red-800',
  [QuoteStatus.VERLOPEN]: 'bg-orange-100 text-orange-800',
};

const statusLabels: Record<string, string> = {
  [QuoteStatus.CONCEPT]: 'Concept',
  [QuoteStatus.TER_GOEDKEURING]: 'Ter goedkeuring',
  [QuoteStatus.GOEDGEKEURD]: 'Goedgekeurd',
  [QuoteStatus.VERSTUURD]: 'Verstuurd',
  [QuoteStatus.BEKEKEN]: 'Bekeken',
  [QuoteStatus.GEACCEPTEERD]: 'Geaccepteerd',
  [QuoteStatus.AFGEWEZEN]: 'Afgewezen',
  [QuoteStatus.VERLOPEN]: 'Verlopen',
};

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];

function getContactName(quote: Quote): string {
  if (!quote.contact) return '\u2014';
  if (quote.contact.companyName) return quote.contact.companyName;
  return [quote.contact.firstName, quote.contact.lastName].filter(Boolean).join(' ') || '\u2014';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

export default function QuotesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [onlyMine, setOnlyMine] = useState(() => localStorage.getItem('inspexi:filter-mine:quotes') === 'true');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, error } = useQuotes({
    search: debouncedSearch.length >= 3 ? debouncedSearch : undefined,
    status: (statusFilter as QuoteStatus) || undefined,
    createdBy: onlyMine ? user?.id : undefined,
    page,
    limit: 20,
  });

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setPage(1);
    },
    [],
  );

  const userCanWrite = user && user.roles.some(r => canWrite.includes(r));

  const columns: ColumnDef<Quote>[] = [
    {
      key: 'quoteNumber',
      header: 'Offertenummer',
      pinned: true,
      render: (quote) => (
        <button
          onClick={() => navigate(`/quotes/${quote.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {quote.quoteNumber}
        </button>
      ),
    },
    {
      key: 'subject',
      header: 'Onderwerp',
      filterable: true,
      filterType: 'text',
      getFilterValue: (quote) => quote.subject,
      render: (quote) => (
        <span className="text-gray-900">{quote.subject}</span>
      ),
    },
    {
      key: 'contact',
      header: 'Relatie',
      filterable: true,
      filterType: 'text',
      getFilterValue: (quote) => getContactName(quote),
      render: (quote) => (
        <span className="text-gray-600">{getContactName(quote)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      filterable: true,
      filterType: 'select',
      filterOptions: statusFilterOptions.filter((o) => o.value !== ''),
      groupable: true,
      getFilterValue: (quote) => quote.status,
      render: (quote) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            statusColors[quote.status] || 'bg-gray-100 text-gray-600'
          }`}
        >
          {statusLabels[quote.status] || quote.status}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Totaal',
      render: (quote) => (
        <span className="text-gray-900 font-medium">
          {formatCurrency(quote.total)}
        </span>
      ),
    },
    {
      key: 'validUntil',
      header: 'Geldig tot',
      filterable: true,
      filterType: 'date',
      getFilterValue: (quote) => quote.validUntil,
      render: (quote) => (
        <span className="text-gray-500 text-xs">
          {quote.validUntil
            ? new Date(quote.validUntil).toLocaleDateString('nl-NL')
            : '\u2014'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Aangemaakt',
      filterable: true,
      filterType: 'date',
      getFilterValue: (quote) => quote.createdAt,
      render: (quote) => (
        <span className="text-gray-500 text-xs">
          {new Date(quote.createdAt).toLocaleDateString('nl-NL')}
        </span>
      ),
    },
  ];

  const {
    activeColumns,
    filteredData,
    pendingColumnConfig,
    setPendingColumnConfig,
    pendingFilters,
    setPendingFilters,
    pendingGrouping,
    setPendingGrouping,
    applyColumns,
    applyFilters,
    resetToDefaults,
    isColumnsDirty,
    isFiltersDirty,
    allColumns,
  } = useTableConfig({ pageKey: 'quotes', columns });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-danger-50 p-4 text-sm text-danger-600">
        Fout bij het laden van offertes: {error.message}
      </div>
    );
  }

  const quotes = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <DetailPageLayout
      sidebar={
        <TableConfigSidebar
          columns={allColumns}
          pendingColumnConfig={pendingColumnConfig}
          onColumnConfigChange={setPendingColumnConfig}
          pendingFilters={pendingFilters}
          onFiltersChange={setPendingFilters}
          pendingGrouping={pendingGrouping}
          onGroupingChange={setPendingGrouping}
          onApplyColumns={applyColumns}
          onApplyFilters={applyFilters}
          onReset={resetToDefaults}
          isColumnsDirty={isColumnsDirty}
          isFiltersDirty={isFiltersDirty}
        />
      }
    >
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Offertes</h2>
          <p className="mt-1 text-sm text-gray-500">
            Beheer offertes en prijsopgaven
          </p>
        </div>
        {userCanWrite && (
          <ActionMenu
            primaryActions={[
              {
                label: 'Offerte aanmaken',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                onClick: () => navigate('/quotes/new'),
              },
            ]}
          />
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            placeholder="Zoeken op nummer, onderwerp of relatie..."
            value={search}
            onChange={handleSearchChange}
          />
        </div>
        <div className="w-48">
          <Select
            options={statusFilterOptions}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm transition-colors hover:border-gray-400">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            checked={onlyMine}
            onChange={(e) => {
              setOnlyMine(e.target.checked);
              localStorage.setItem('inspexi:filter-mine:quotes', String(e.target.checked));
              setPage(1);
            }}
          />
          <span className="text-gray-700">Mijn offertes</span>
        </label>
      </div>

      <Table
        columns={activeColumns}
        data={filteredData(quotes)}
        keyExtractor={(q) => q.id}
        emptyMessage="Geen offertes gevonden"
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {total} offerte{total !== 1 ? 's' : ''} gevonden
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Vorige
            </Button>
            <span className="flex items-center px-3 text-sm text-gray-600">
              {page} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Volgende
            </Button>
          </div>
        </div>
      )}
    </div>
    </DetailPageLayout>
  );
}

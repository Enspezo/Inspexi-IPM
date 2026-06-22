import { tenantStorage } from '@/lib/storage';
import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QuoteStatus, Role } from '@/types';
import type { Quote } from '@/types';
import {
  ActionMenu,
  Button,
  ErrorBox,
  Spinner,
  StatusBadge,
  Table,
  Input,
  Select,
} from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { QUOTE_STATUS } from '@/lib/status';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useAuth } from '@/providers/auth-provider';
import { useWindowTabs } from '@/providers/window-tabs';
import { useQuotes } from './hooks/use-quotes';
import { useQuoteTemplates } from './hooks/use-quote-templates';

const NO_TEMPLATE_LABEL = 'Geen template';

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

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];

function getContactName(quote: Quote): string {
  if (!quote.contact) return '\u2014';
  if (quote.contact.companyName) return quote.contact.companyName;
  return [quote.contact.firstName, quote.contact.lastName].filter(Boolean).join(' ') || '\u2014';
}

export default function QuotesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { openTab } = useWindowTabs();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [templateFilter, setTemplateFilter] = useState('');
  const [onlyMine, setOnlyMine] = useState(() => tenantStorage.getItem('filter-mine:quotes') === 'true');
  const [page, setPage] = useState(1);

  const { data: templatesData } = useQuoteTemplates({ limit: 200 });
  const templates = templatesData?.data ?? [];

  // Prominent filterbar Select: server-side via templateId param ('none' → no template)
  const templateFilterOptions = [
    { value: '', label: 'Alle templates' },
    ...templates.map((t) => ({ value: t.id, label: t.name })),
    { value: 'none', label: NO_TEMPLATE_LABEL },
  ];

  // Table column select-filter + grouping: matches on template name (or the "no template" label)
  const templateColumnFilterOptions = [
    ...templates.map((t) => ({ value: t.name, label: t.name })),
    { value: NO_TEMPLATE_LABEL, label: NO_TEMPLATE_LABEL },
  ];

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

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
      sortable: true,
      sortKey: 'quoteNumber',
      render: (quote) => (
        <button
          // Opens the offerte as an in-window tab. ⌘/Ctrl- or middle-click
          // opens it in the background without switching away from the list.
          onClick={(e) =>
            openTab('quote', quote.id, quote.quoteNumber, {
              background: e.metaKey || e.ctrlKey,
            })
          }
          onMouseDown={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              openTab('quote', quote.id, quote.quoteNumber, { background: true });
            }
          }}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {quote.quoteNumber}
        </button>
      ),
    },
    {
      key: 'subject',
      header: 'Onderwerp',
      sortable: true,
      sortKey: 'subject',
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
      sortable: true,
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
      sortable: true,
      sortKey: 'status',
      filterable: true,
      filterType: 'select',
      filterOptions: statusFilterOptions.filter((o) => o.value !== ''),
      groupable: true,
      getFilterValue: (quote) => quote.status,
      render: (quote) => <StatusBadge status={quote.status} map={QUOTE_STATUS} />,
    },
    {
      key: 'template',
      header: 'Template',
      filterable: true,
      filterType: 'select',
      filterOptions: templateColumnFilterOptions,
      groupable: true,
      getFilterValue: (quote) => quote.template?.name ?? NO_TEMPLATE_LABEL,
      render: (quote) => (
        <span className="text-gray-600">{quote.template?.name ?? '—'}</span>
      ),
    },
    {
      key: 'total',
      header: 'Totaal',
      sortable: true,
      sortKey: 'total',
      render: (quote) => (
        <span className="text-gray-900 font-medium">
          {formatCurrency(quote.total)}
        </span>
      ),
    },
    {
      key: 'validUntil',
      header: 'Geldig tot',
      sortable: true,
      sortKey: 'validUntil',
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
      sortable: true,
      sortKey: 'createdAt',
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
    sort,
    toggleSort,
    apiSort,
  } = useTableConfig({ pageKey: 'quotes', columns });

  useEffect(() => {
    setPage(1);
  }, [sort]);

  const { data, isLoading, error } = useQuotes({
    search: debouncedSearch.length >= 3 ? debouncedSearch : undefined,
    status: (statusFilter as QuoteStatus) || undefined,
    templateId: templateFilter || undefined,
    createdBy: onlyMine ? user?.id : undefined,
    page,
    limit: 20,
    sortBy: apiSort?.sortBy,
    sortOrder: apiSort?.sortOrder,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorBox>
        Fout bij het laden van offertes: {error.message}
      </ErrorBox>
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
      <PageHeader
        title="Offertes"
        description="Beheer offertes en prijsopgaven"
        actions={
          userCanWrite ? (
            <ActionMenu
              secondaryActions={[
                {
                  label: 'Offerte aanmaken',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                  onClick: () => navigate('/quotes/new'),
                },
              ]}
            />
          ) : undefined
        }
      />

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
        <div className="w-48">
          <Select
            options={templateFilterOptions}
            value={templateFilter}
            onChange={(e) => {
              setTemplateFilter(e.target.value);
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
              tenantStorage.setItem('filter-mine:quotes', String(e.target.checked));
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
        sort={sort}
        onSort={toggleSort}
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

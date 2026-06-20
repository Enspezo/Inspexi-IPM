import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionMenu,
  ErrorBox,
  Spinner,
  Button,
  Input,
  Table,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import { LocationTypeBadge } from '@/components/location-type-badge';
import { SelectContactModal } from '@/components/contacts/select-contact-modal';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useLocations } from './hooks/use-contacts';
import { useLocationTypes } from '@/pages/location-types/hooks/use-location-types';
import { AddLocationModal } from './components/add-location-modal';
import { LocationsMap } from './components/locations-map';
import type { LocationWithContact } from './components/location-popup';
import { tenantStorage } from '@/lib/storage';

// View toggle persisted per-tenant.
const VIEW_STORAGE_KEY = 'locations-view';
type LocationsView = 'list' | 'map';
// Load up to this many locations for client-side filtering across both views.
const LOAD_LIMIT = 1000;
const PAGE_SIZE = 20;

function getContactName(contact?: LocationWithContact['contact']): string {
  if (!contact) return '—';
  if (contact.companyName) return contact.companyName;
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
}

function getLocationAddress(location: LocationWithContact): string {
  return `${location.street} ${location.houseNumber}, ${location.postalCode} ${location.city}`;
}

export default function LocationsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<LocationsView>(() =>
    tenantStorage.getItem(VIEW_STORAGE_KEY) === 'map' ? 'map' : 'list',
  );
  const [listPage, setListPage] = useState(1);
  const [isSelectContactOpen, setIsSelectContactOpen] = useState(false);
  const [createContactId, setCreateContactId] = useState<string | null>(null);

  // Single dataset for both views; filters in the sidebar apply to both.
  const { data, isLoading, error } = useLocations({
    search: search || undefined,
    limit: LOAD_LIMIT,
  });
  const { data: locationTypes = [] } = useLocationTypes({ scope: 'CRM' });

  const setViewPersisted = useCallback((next: LocationsView) => {
    setView(next);
    tenantStorage.setItem(VIEW_STORAGE_KEY, next);
  }, []);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setListPage(1);
    },
    [],
  );

  // Build type filter options from the CRM types (fallback: distinct names in data).
  const typeFilterOptions = locationTypes.length
    ? locationTypes.map((t) => ({ value: t.name, label: t.name }))
    : [];

  const columns: ColumnDef<LocationWithContact>[] = [
    {
      key: 'name',
      header: 'Naam',
      pinned: true,
      sortable: true,
      filterable: true,
      filterType: 'text',
      getFilterValue: (location) => location.name,
      render: (location) => (
        <button
          onClick={() => navigate(`/contacts/locations/${location.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {location.name}
        </button>
      ),
    },
    {
      key: 'address',
      header: 'Adres',
      sortable: true,
      filterable: true,
      filterType: 'text',
      getFilterValue: (location) => getLocationAddress(location),
      render: (location) => (
        <span className="text-gray-600">
          {location.street} {location.houseNumber}, {location.postalCode} {location.city}
        </span>
      ),
    },
    {
      key: 'city',
      header: 'Stad',
      defaultVisible: false,
      sortable: true,
      filterable: true,
      filterType: 'text',
      groupable: true,
      getFilterValue: (location) => location.city,
      render: (location) => (
        <span className="text-gray-600">{location.city || '—'}</span>
      ),
    },
    {
      key: 'locationType',
      header: 'Type',
      sortable: true,
      filterable: true,
      filterType: 'select',
      filterOptions: typeFilterOptions,
      groupable: true,
      getFilterValue: (location) => location.locationType?.name ?? '',
      render: (location) => <LocationTypeBadge locationType={location.locationType} />,
    },
    {
      key: 'contact',
      header: 'Relatie',
      sortable: true,
      filterable: true,
      filterType: 'text',
      groupable: true,
      getFilterValue: (location) =>
        location.contact ? getContactName(location.contact) : '',
      render: (location) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (location.contact) navigate(`/contacts/${location.contact.id}`);
          }}
          className="text-sm text-primary-600 hover:text-primary-800 hover:underline"
        >
          {getContactName(location.contact)}
        </button>
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
  } = useTableConfig({ pageKey: 'locations', columns });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorBox>Fout bij het laden van locaties: {error.message}</ErrorBox>
    );
  }

  const allLocations = (data?.data || []) as LocationWithContact[];
  const serverTotal = data?.total || 0;
  // Apply the sidebar filters/grouping/sort ONCE; both views render from this.
  const filtered = filteredData(allLocations);
  const truncated = serverTotal > allLocations.length;

  return (
    <>
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
            title="Locaties"
            description="Overzicht van alle locaties"
            actions={
              <div className="flex items-center gap-3">
                <ViewToggle view={view} onChange={setViewPersisted} />
                <ActionMenu
                  secondaryActions={[
                    {
                      label: 'Nieuwe locatie',
                      icon: (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      ),
                      onClick: () => setIsSelectContactOpen(true),
                    },
                  ]}
                />
              </div>
            }
          />

          {/* Search */}
          <div className="max-w-md">
            <Input
              placeholder="Zoeken op naam, adres, stad..."
              value={search}
              onChange={handleSearchChange}
            />
          </div>

          {truncated && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Alleen de eerste {allLocations.length} locaties zijn geladen (van {serverTotal}).
              Verfijn de zoekopdracht om specifieke locaties te vinden.
            </p>
          )}

          {view === 'list' ? (
            <ListView
              filtered={filtered}
              page={listPage}
              onPageChange={setListPage}
              activeColumns={activeColumns}
              sort={sort}
              onSort={toggleSort}
            />
          ) : (
            <div style={{ height: '70vh' }}>
              <LocationsMap locations={filtered} />
            </div>
          )}
        </div>
      </DetailPageLayout>

      {isSelectContactOpen && (
        <SelectContactModal
          onSelect={(contactId) => {
            setCreateContactId(contactId);
            setIsSelectContactOpen(false);
          }}
          onClose={() => setIsSelectContactOpen(false)}
        />
      )}

      {createContactId && (
        <AddLocationModal
          isOpen
          contactId={createContactId}
          onClose={() => setCreateContactId(null)}
        />
      )}
    </>
  );
}

// ─── View toggle (segmented control) ──────────────────────

function ViewToggle({
  view,
  onChange,
}: {
  view: LocationsView;
  onChange: (v: LocationsView) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 shadow-sm">
      <button
        type="button"
        onClick={() => onChange('list')}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          view === 'list'
            ? 'bg-primary-600 text-white'
            : 'text-gray-600 hover:bg-gray-50'
        }`}
      >
        Lijst
      </button>
      <button
        type="button"
        onClick={() => onChange('map')}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          view === 'map'
            ? 'bg-primary-600 text-white'
            : 'text-gray-600 hover:bg-gray-50'
        }`}
      >
        Kaart
      </button>
    </div>
  );
}

// ─── List view (client-side pagination over `filtered`) ──

function ListView({
  filtered,
  page,
  onPageChange,
  activeColumns,
  sort,
  onSort,
}: {
  filtered: LocationWithContact[];
  page: number;
  onPageChange: (p: number) => void;
  activeColumns: ColumnDef<LocationWithContact>[];
  sort: ReturnType<typeof useTableConfig>['sort'];
  onSort: ReturnType<typeof useTableConfig>['toggleSort'];
}) {
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Keep the page in range when the filtered set shrinks.
  useEffect(() => {
    if (page > totalPages) onPageChange(totalPages);
  }, [page, totalPages, onPageChange]);

  const start = (page - 1) * PAGE_SIZE;
  const pageData = filtered.slice(start, start + PAGE_SIZE);

  return (
    <>
      <Table
        columns={activeColumns}
        data={pageData}
        keyExtractor={(l) => l.id}
        emptyMessage="Geen locaties gevonden"
        sort={sort}
        onSort={onSort}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {total} locatie{total !== 1 ? 's' : ''} gevonden
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(Math.max(1, page - 1))}
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
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              Volgende
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

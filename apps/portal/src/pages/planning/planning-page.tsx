import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlanningStatus, Role } from '@/types';
import type { PlanningItem } from '@/types';
import { ActionMenu, Button, Spinner, Table, Input, Select } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useAuth } from '@/providers/auth-provider';
import { usePlanningItems } from './hooks/use-planning';
import { useOrganization } from '../organization/hooks/use-organization';
import {
  PlanningCalendarView,
  MONTHS_NL,
  getMonday,
  addDays,
  type CalendarViewMode,
} from './components/planning-calendar-view';
import { InspectorFilter, type InspectorOption } from './components/inspector-filter';
import { PlanningMapModal } from './components/planning-map-modal';

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'list' | CalendarViewMode;

// ─── Constants ────────────────────────────────────────────────────────────────

const statusFilterOptions = [
  { value: '', label: 'Alle statussen' },
  { value: PlanningStatus.NOG_TE_PLANNEN, label: 'Nog te plannen' },
  { value: PlanningStatus.CONCEPT, label: 'Concept' },
  { value: PlanningStatus.GEPLAND, label: 'Gepland' },
  { value: PlanningStatus.AFGEROND, label: 'Afgerond' },
  { value: PlanningStatus.VERVALLEN, label: 'Vervallen' },
];

const statusColors: Record<string, string> = {
  [PlanningStatus.NOG_TE_PLANNEN]: 'bg-gray-100 text-gray-700',
  [PlanningStatus.CONCEPT]: 'bg-yellow-100 text-yellow-800',
  [PlanningStatus.GEPLAND]: 'bg-blue-100 text-blue-800',
  [PlanningStatus.AFGEROND]: 'bg-green-100 text-green-800',
  [PlanningStatus.VERVALLEN]: 'bg-red-100 text-red-800',
};

const statusLabels: Record<string, string> = {
  [PlanningStatus.NOG_TE_PLANNEN]: 'Nog te plannen',
  [PlanningStatus.CONCEPT]: 'Concept',
  [PlanningStatus.GEPLAND]: 'Gepland',
  [PlanningStatus.AFGEROND]: 'Afgerond',
  [PlanningStatus.VERVALLEN]: 'Vervallen',
};

const canWrite = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
];

const PAGE_KEY = 'planning-list';

// ─── Calendar helpers ─────────────────────────────────────────────────────────

function getCalendarTitle(view: ViewMode, date: Date): string {
  if (view === 'maand') {
    return `${MONTHS_NL[date.getMonth()]} ${date.getFullYear()}`;
  }
  if (view === 'week') {
    const monday = getMonday(date);
    const sunday = addDays(monday, 6);
    if (monday.getMonth() === sunday.getMonth()) {
      return `${monday.getDate()}–${sunday.getDate()} ${MONTHS_NL[monday.getMonth()]} ${monday.getFullYear()}`;
    }
    return `${monday.getDate()} ${MONTHS_NL[monday.getMonth()].slice(0, 3)} – ${sunday.getDate()} ${MONTHS_NL[sunday.getMonth()].slice(0, 3)} ${sunday.getFullYear()}`;
  }
  // dag
  return `${date.getDate()} ${MONTHS_NL[date.getMonth()]} ${date.getFullYear()}`;
}

function navigatePrev(view: ViewMode, date: Date): Date {
  if (view === 'maand') return new Date(date.getFullYear(), date.getMonth() - 1, 1);
  if (view === 'week') return addDays(date, -7);
  return addDays(date, -1);
}

function navigateNext(view: ViewMode, date: Date): Date {
  if (view === 'maand') return new Date(date.getFullYear(), date.getMonth() + 1, 1);
  if (view === 'week') return addDays(date, 7);
  return addDays(date, 1);
}

/** Compute dateFrom/dateTo for calendar queries */
function getCalendarRange(view: ViewMode, date: Date): { dateFrom: string; dateTo: string } {
  if (view === 'dag') {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
  }
  if (view === 'week') {
    const start = getMonday(date);
    start.setHours(0, 0, 0, 0);
    const end = addDays(start, 6);
    end.setHours(23, 59, 59, 999);
    return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
  }
  // maand — full 6-week grid
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const gridStart = getMonday(firstOfMonth);
  gridStart.setHours(0, 0, 0, 0);
  const gridEnd = addDays(gridStart, 41);
  gridEnd.setHours(23, 59, 59, 999);
  return { dateFrom: gridStart.toISOString(), dateTo: gridEnd.toISOString() };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlanningPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: orgData } = useOrganization(user?.orgId);
  const dayStart = orgData?.workdayStart ?? 8;
  const dayEnd = orgData?.workdayEnd ?? 17;

  // View toggle — persisted in localStorage
  const [view, setViewState] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('inspexi:planning-view') as ViewMode | null;
    return saved && ['list', 'maand', 'week', 'dag'].includes(saved) ? saved : 'list';
  });
  const setView = useCallback((v: ViewMode) => {
    localStorage.setItem('inspexi:planning-view', v);
    setViewState(v);
  }, []);

  // Calendar navigation — persisted in localStorage
  const [calendarDate, setCalendarDateState] = useState<Date>(() => {
    const saved = localStorage.getItem('inspexi:planning-date');
    if (saved) {
      const d = new Date(saved);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });
  const setCalendarDate = useCallback((d: Date) => {
    localStorage.setItem('inspexi:planning-date', d.toISOString());
    setCalendarDateState(d);
  }, []);

  // Inspector filter (shared by list + calendar views)
  const [selectedInspectorIds, setSelectedInspectorIds] = useState<string[]>([]);

  // Map modal
  const [mapOpen, setMapOpen] = useState(false);

  // List-view filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PlanningStatus | ''>('');
  const [page, setPage] = useState(1);

  // Debounce: wacht 300ms na laatste toetsaanslag, minimaal 3 tekens vereist
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ─── Table config (list view) ───────────────────────────────────────────────
  const columns: ColumnDef<PlanningItem>[] = [
    {
      key: 'status',
      header: 'Status',
      sidebarLabel: 'Status',
      filterable: true,
      filterType: 'select',
      filterOptions: statusFilterOptions.slice(1).map((o) => ({
        value: o.value,
        label: o.label,
      })),
      pinned: true,
      sortable: true,
      sortKey: 'status',
      render: (item) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            statusColors[item.status] ?? 'bg-gray-100 text-gray-700'
          }`}
        >
          {statusLabels[item.status] ?? item.status}
        </span>
      ),
    },
    {
      key: 'scheduledDate',
      header: 'Datum',
      sidebarLabel: 'Geplande datum',
      filterable: true,
      filterType: 'date',
      sortable: true,
      sortKey: 'scheduledDate',
      getSortValue: (item) => item.scheduledDate ?? null,
      render: (item) => {
        if (item.isMultiDay) {
          const sessionDates = (item.sessions ?? [])
            .filter(s => !s.isCancelled && s.scheduledDate)
            .map(s => new Date(s.scheduledDate!))
            .sort((a, b) => a.getTime() - b.getTime());
          const totalCount = item.sessionCount ?? (item.sessions?.filter(s => !s.isCancelled).length ?? 0);
          if (sessionDates.length === 0) {
            return (
              <div className="space-y-0.5">
                <span className="text-gray-400">Nog te plannen</span>
                <div><span className="inline-block rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">{totalCount} sessies</span></div>
              </div>
            );
          }
          const first = sessionDates[0];
          const last = sessionDates[sessionDates.length - 1];
          const range = first.getTime() === last.getTime()
            ? first.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
            : `${first.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – ${last.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}`;
          return (
            <div className="space-y-0.5">
              <span>{range}</span>
              <div><span className="inline-block rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">{totalCount} sessies</span></div>
            </div>
          );
        }
        return item.scheduledDate ? (
          new Date(item.scheduledDate).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
        ) : (
          <span className="text-gray-400">Niet gepland</span>
        );
      },
    },
    {
      key: 'productName',
      header: 'Dienst',
      sidebarLabel: 'Dienst / product',
      filterable: true,
      filterType: 'text',
      sortable: true,
      render: (item) => (
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => navigate(`/planning/${item.id}`)}
              className="font-medium text-primary-600 hover:text-primary-800 hover:underline text-left"
            >
              {item.productName}
            </button>
            {item.isMultiDay && (
              <span className="inline-block rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">Meerdaags</span>
            )}
          </div>
          {item.labels.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {item.labels.map((l) => (
                <span
                  key={l}
                  className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                >
                  {l}
                </span>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Opdrachtgever',
      sidebarLabel: 'Opdrachtgever',
      sortable: true,
      getSortValue: (item) => item.contact ? (item.contact.companyName || `${item.contact.firstName ?? ''} ${item.contact.lastName ?? ''}`.trim()) : '',
      render: (item) => {
        const c = item.contact;
        if (!c) return <span className="text-gray-400">—</span>;
        return (
          <span>
            {c.companyName ||
              `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() ||
              '—'}
          </span>
        );
      },
    },
    {
      key: 'location',
      header: 'Locatie',
      sidebarLabel: 'Locatie',
      sortable: true,
      getSortValue: (item) => item.location?.city ?? '',
      render: (item) => {
        const l = item.location;
        if (!l) return <span className="text-gray-400">—</span>;
        return (
          <span className="text-sm text-gray-600">
            {[l.street, l.houseNumber, l.city].filter(Boolean).join(' ')}
          </span>
        );
      },
    },
    {
      key: 'inspectors',
      header: 'Inspecteurs',
      sidebarLabel: 'Inspecteurs',
      render: (item) => {
        const ins = item.inspectors ?? [];
        if (ins.length === 0) return <span className="text-gray-400">—</span>;
        return (
          <div className="flex items-center gap-1">
            {ins.slice(0, 3).map((i) => (
              <span
                key={i.id}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: i.user?.color ?? '#6B7280' }}
                title={`${i.user?.firstName} ${i.user?.lastName}`}
              >
                {i.user?.initials ??
                  `${i.user?.firstName?.[0] ?? ''}${i.user?.lastName?.[0] ?? ''}`}
              </span>
            ))}
            {ins.length > 3 && (
              <span className="text-xs text-gray-500">+{ins.length - 3}</span>
            )}
          </div>
        );
      },
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
  } = useTableConfig({ pageKey: PAGE_KEY, columns });

  useEffect(() => {
    setPage(1);
  }, [sort]);

  // ─── Query params ───────────────────────────────────────────────────────────
  const queryParams = useMemo(() => {
    if (view === 'list') {
      return {
        search: debouncedSearch.length >= 3 ? debouncedSearch : undefined,
        status: statusFilter || undefined,
        page,
        limit: 25,
        sortBy: apiSort?.sortBy,
        sortOrder: apiSort?.sortOrder,
      };
    }
    return {
      ...getCalendarRange(view, calendarDate),
      limit: 300,
      page: 1,
    };
  }, [view, debouncedSearch, statusFilter, page, calendarDate, apiSort]);

  const { data, isLoading } = usePlanningItems(queryParams);

  // ─── Inspector list derived from loaded items ───────────────────────────────
  const allItems: PlanningItem[] = data?.data ?? [];

  const inspectors = useMemo((): InspectorOption[] => {
    const map = new Map<string, InspectorOption>();
    allItems.forEach((item) => {
      item.inspectors?.forEach((i) => {
        if (i.userId && i.user && !map.has(i.userId)) {
          const firstName = i.user.firstName ?? '';
          const lastName = i.user.lastName ?? '';
          map.set(i.userId, {
            id: i.userId,
            name: `${firstName} ${lastName}`.trim() || (i.user.email ?? '?'),
            color: i.user.color ?? '#6B7280',
            initials:
              i.user.initials ??
              `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase(),
          });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems]);

  // ─── Client-side inspector filter ──────────────────────────────────────────
  const filteredByInspector = useMemo((): PlanningItem[] => {
    if (selectedInspectorIds.length === 0) return allItems;
    return allItems.filter((item) =>
      item.inspectors?.some(
        (i) => i.userId && selectedInspectorIds.includes(i.userId),
      ),
    );
  }, [allItems, selectedInspectorIds]);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  const handleStatusChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setStatusFilter(e.target.value as PlanningStatus | '');
      setPage(1);
    },
    [],
  );

  // ─── Calendar navigation ────────────────────────────────────────────────────
  const handleDayClick = (date: Date) => {
    setCalendarDate(date);
    setView('dag');
  };

  const handleWeekClick = (date: Date) => {
    setCalendarDate(date);
    setView('week');
  };

  // ─── View toggle labels ─────────────────────────────────────────────────────
  const viewOptions: { key: ViewMode; label: string }[] = [
    { key: 'list', label: 'Lijst' },
    { key: 'maand', label: 'Maand' },
    { key: 'week', label: 'Week' },
    { key: 'dag', label: 'Dag' },
  ];

  const isCalendar = view !== 'list';

  return (
    <DetailPageLayout
      sidebar={
        view === 'list' ? (
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
        ) : null
      }
    >
      {/* ── Page header ── */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planning</h1>
          {view === 'list' && data && (
            <p className="mt-0.5 text-sm text-gray-500">
              {data.total} planregel{data.total !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-md border border-gray-300 bg-white overflow-hidden shadow-sm">
            {viewOptions.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors border-r border-gray-200 last:border-r-0 ${
                  view === key
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Map button */}
          <button
            onClick={() => setMapOpen(true)}
            title="Kaartweergave"
            className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Kaart
          </button>

          {user && user.roles.some(r => canWrite.includes(r)) && (
            <ActionMenu
              secondaryActions={[
                {
                  label: 'Nieuwe planregel',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                  onClick: () => navigate('/planning/new'),
                },
              ]}
            />
          )}
        </div>
      </div>

      {/* ── Filters bar ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Search + Status — only in list view */}
        {view === 'list' && (
          <>
            <div className="w-56">
              <Input
                placeholder="Zoeken..."
                value={search}
                onChange={handleSearch}
              />
            </div>
            <div className="w-44">
              <Select
                options={statusFilterOptions}
                value={statusFilter}
                onChange={handleStatusChange}
              />
            </div>
          </>
        )}

        {/* Calendar navigation — only in calendar views */}
        {isCalendar && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCalendarDate(navigatePrev(view, calendarDate))}
              className="rounded border border-gray-300 bg-white p-1.5 hover:bg-gray-50 shadow-sm"
              title="Vorige"
            >
              <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => setCalendarDate(new Date())}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm"
            >
              Vandaag
            </button>
            <button
              onClick={() => setCalendarDate(navigateNext(view, calendarDate))}
              className="rounded border border-gray-300 bg-white p-1.5 hover:bg-gray-50 shadow-sm"
              title="Volgende"
            >
              <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-800 min-w-[180px]">
              {getCalendarTitle(view, calendarDate)}
            </span>
          </div>
        )}

        {/* Inspector filter — always visible */}
        <div className="ml-auto">
          <InspectorFilter
            inspectors={inspectors}
            selectedIds={selectedInspectorIds}
            onChange={setSelectedInspectorIds}
          />
        </div>
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : view === 'list' ? (
        <>
          <Table
            columns={activeColumns}
            data={filteredData(filteredByInspector)}
            emptyMessage="Geen planregels gevonden"
            keyExtractor={(item) => item.id}
            sort={sort}
            onSort={toggleSort}
          />
          {data && data.total > data.limit && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <span>
                {(page - 1) * data.limit + 1}–
                {Math.min(page * data.limit, data.total)} van {data.total}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Vorige
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * data.limit >= data.total}
                >
                  Volgende
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Calendar views — fill available height */
        <div className="rounded-lg border border-gray-200 overflow-hidden flex flex-col"
             style={{ height: 'calc(100vh - 230px)', minHeight: 500 }}>
          <PlanningCalendarView
            items={filteredByInspector}
            view={view as CalendarViewMode}
            currentDate={calendarDate}
            onDayClick={handleDayClick}
            onWeekClick={handleWeekClick}
            onItemClick={(id) => navigate(`/planning/${id}`)}
            dayStart={dayStart}
            dayEnd={dayEnd}
          />
        </div>
      )}

      <PlanningMapModal
        isOpen={mapOpen}
        onClose={() => setMapOpen(false)}
        items={filteredByInspector}
      />
    </DetailPageLayout>
  );
}

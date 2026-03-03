import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { NoteEntityType } from '@/types';
import type { Note } from '@/types';
import {
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
import { useNotes } from './hooks/use-notes';

const entityTypeFilterOptions = [
  { value: '', label: 'Alle entiteiten' },
  { value: NoteEntityType.CONTACT, label: 'Relatie' },
  { value: NoteEntityType.REQUEST, label: 'Aanvraag' },
  { value: NoteEntityType.QUOTE, label: 'Offerte' },
  { value: NoteEntityType.PLANNING, label: 'Planning' },
  { value: NoteEntityType.PROJECT, label: 'Project' },
  { value: NoteEntityType.USER, label: 'Gebruiker' },
];

const entityTypeLabels: Record<string, string> = {
  [NoteEntityType.CONTACT]: 'Relatie',
  [NoteEntityType.REQUEST]: 'Aanvraag',
  [NoteEntityType.QUOTE]: 'Offerte',
  [NoteEntityType.PLANNING]: 'Planning',
  [NoteEntityType.PROJECT]: 'Project',
  [NoteEntityType.USER]: 'Gebruiker',
};

const entityTypeRoutes: Record<string, string> = {
  [NoteEntityType.CONTACT]: '/contacts',
  [NoteEntityType.REQUEST]: '/requests',
  [NoteEntityType.QUOTE]: '/quotes',
  [NoteEntityType.PLANNING]: '/planning',
  [NoteEntityType.PROJECT]: '/projects',
  [NoteEntityType.USER]: '/users',
};

export default function NotesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useNotes({
    search: search || undefined,
    entityType: (entityTypeFilter as NoteEntityType) || undefined,
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

  const columns: ColumnDef<Note>[] = [
    {
      key: 'content',
      header: 'Notitie',
      pinned: true,
      render: (note) => (
        <span className="block max-w-xs truncate text-sm text-gray-900" title={note.content}>
          {note.content.length > 80 ? note.content.slice(0, 80) + '…' : note.content}
          {(note.replyCount ?? 0) > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
              {note.replyCount} antwoord{note.replyCount !== 1 ? 'en' : ''}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'entityType',
      header: 'Gekoppeld aan',
      filterable: true,
      filterType: 'select',
      filterOptions: entityTypeFilterOptions.filter((o) => o.value !== ''),
      groupable: true,
      getFilterValue: (note) => note.entityType,
      render: (note) => (
        <button
          onClick={() =>
            navigate(`${entityTypeRoutes[note.entityType]}/${note.entityId}`)
          }
          className="text-sm text-primary-600 hover:text-primary-800 hover:underline"
          title={entityTypeLabels[note.entityType]}
        >
          <span className="text-xs text-gray-400 mr-1">
            {entityTypeLabels[note.entityType]}
          </span>
          <span className="truncate max-w-[160px] inline-block align-bottom">
            {note.entityName || note.entityId}
          </span>
        </button>
      ),
    },
    {
      key: 'createdBy',
      header: 'Aangemaakt door',
      filterable: true,
      filterType: 'text',
      getFilterValue: (note) =>
        `${note.createdBy.firstName} ${note.createdBy.lastName}`,
      render: (note) => (
        <span className="text-sm text-gray-600">
          {note.createdBy.firstName} {note.createdBy.lastName}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Aangemaakt',
      filterable: true,
      filterType: 'date',
      getFilterValue: (note) => note.createdAt,
      render: (note) => (
        <span className="text-xs text-gray-500">
          {new Date(note.createdAt).toLocaleDateString('nl-NL')}
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
  } = useTableConfig({ pageKey: 'notes', columns });

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
        Fout bij het laden van notities: {error.message}
      </div>
    );
  }

  const notes = data?.data || [];
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
            <h2 className="text-2xl font-bold text-gray-900">Notities</h2>
            <p className="mt-1 text-sm text-gray-500">
              Bekijk en zoek door notities
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              placeholder="Zoeken in notities..."
              value={search}
              onChange={handleSearchChange}
            />
          </div>
          <div className="w-48">
            <Select
              options={entityTypeFilterOptions}
              value={entityTypeFilter}
              onChange={(e) => {
                setEntityTypeFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <Table
          columns={activeColumns}
          data={filteredData(notes)}
          keyExtractor={(n) => n.id}
          emptyMessage="Geen notities gevonden"
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {total} {total !== 1 ? 'notities' : 'notitie'} gevonden
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

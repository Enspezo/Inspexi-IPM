// Overzichtspagina (FLAT array) — /measurement-sheet-templates geeft een platte
// MeasurementSheetTemplate[]. Zoeken client-side; status via StatusBadge. Geen server-paginatie.
// NB: MeasurementSheetTemplate heeft GEEN isSystem-veld, dus geen herkomst-kolom.

import { useState } from 'react';
import type { MeasurementSheetTemplate } from '@/types';
import { ErrorBox, Spinner, Table, Input, StatusBadge } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import { TableConfigSidebar, useTableConfig, type ColumnDef } from '@/components/table-config';
import { MEASUREMENT_SHEET_STATUS } from '@/lib/status';
import { useMeasurementSheetTemplates } from './hooks/use-measurement-sheet-templates';

export default function MeasurementSheetTemplatesPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useMeasurementSheetTemplates();

  const columns: ColumnDef<MeasurementSheetTemplate>[] = [
    {
      key: 'name', header: 'Naam', pinned: true, sortable: true, sortKey: 'name',
      render: (t) => <span className="font-medium text-gray-900">{t.name}</span>,
    },
    {
      key: 'code', header: 'Code', sortable: true, sortKey: 'code',
      render: (t) => <span className="text-gray-600">{t.code}</span>,
    },
    {
      key: 'normTypeCode', header: 'Normtype', sortable: true, sortKey: 'normTypeCode',
      render: (t) => <span className="text-gray-600">{t.normTypeCode}</span>,
    },
    {
      key: 'version', header: 'Versie', sortable: true, sortKey: 'version',
      render: (t) => <span className="text-gray-600">{t.version}</span>,
    },
    {
      key: 'status', header: 'Status', sortable: true, sortKey: 'status',
      filterable: true, filterType: 'select',
      filterOptions: Object.entries(MEASUREMENT_SHEET_STATUS).map(([value, { label }]) => ({ value, label })),
      groupable: true, getFilterValue: (t) => t.status,
      render: (t) => <StatusBadge status={t.status} map={MEASUREMENT_SHEET_STATUS} />,
    },
    {
      key: 'createdAt', header: 'Aangemaakt', filterable: true, filterType: 'date',
      sortable: true, sortKey: 'createdAt', getFilterValue: (t) => t.createdAt,
      render: (t) => <span className="text-xs text-gray-500">{new Date(t.createdAt).toLocaleDateString('nl-NL')}</span>,
    },
  ];

  const {
    activeColumns, filteredData, pendingColumnConfig, setPendingColumnConfig,
    pendingFilters, setPendingFilters, pendingGrouping, setPendingGrouping,
    applyColumns, applyFilters, resetToDefaults, isColumnsDirty, isFiltersDirty,
    allColumns, sort, toggleSort,
  } = useTableConfig({ pageKey: 'measurement-sheet-templates', columns });

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (error) return <ErrorBox>Fout bij het laden van meetstaat-templates: {(error as Error).message}</ErrorBox>;

  const rows = data ?? [];
  const term = search.trim().toLowerCase();
  const searched = term
    ? rows.filter((r) => [r.name, r.code].some((v) => v?.toLowerCase().includes(term)))
    : rows;

  return (
    <DetailPageLayout
      sidebar={
        <TableConfigSidebar
          columns={allColumns}
          pendingColumnConfig={pendingColumnConfig} onColumnConfigChange={setPendingColumnConfig}
          pendingFilters={pendingFilters} onFiltersChange={setPendingFilters}
          pendingGrouping={pendingGrouping} onGroupingChange={setPendingGrouping}
          onApplyColumns={applyColumns} onApplyFilters={applyFilters} onReset={resetToDefaults}
          isColumnsDirty={isColumnsDirty} isFiltersDirty={isFiltersDirty}
        />
      }
    >
      <div className="space-y-6">
        <PageHeader title="Meetstaat-templates" description="Meetstaat-templates beheren en doorzoeken" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input placeholder="Zoeken op naam of code..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <Table
          columns={activeColumns}
          data={filteredData(searched)}
          keyExtractor={(r) => r.id}
          emptyMessage="Geen meetstaat-templates gevonden"
          sort={sort}
          onSort={toggleSort}
        />

        <p className="text-sm text-gray-500">{searched.length} {searched.length !== 1 ? 'resultaten' : 'resultaat'}</p>
      </div>
    </DetailPageLayout>
  );
}

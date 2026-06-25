// FLAT-weergave (client-side zoeken/filteren) over de gepagineerde lijst.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Role, type MeasurementInstrument } from '@/types';
import { Button, ErrorBox, Spinner, StatusBadge, Table, Input } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import { TableConfigSidebar, useTableConfig, type ColumnDef } from '@/components/table-config';
import { formatShortDate } from '@/lib/format';
import { MEETMIDDEL_KALIBRATIE_STATUS, MEETMIDDEL_STATUS } from '@/lib/status';
import { useAuth } from '@/providers/auth-provider';
import { useMeetmiddelen } from './hooks/use-meetmiddelen';
import { CreateMeetmiddelModal } from './components/create-meetmiddel-modal';

const WRITE_ROLES: Role[] = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.WERKVOORBEREIDER];

export default function MeetmiddelenPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading, error } = useMeetmiddelen({ limit: 200 });

  const canManage = !!user && user.roles.some((r) => WRITE_ROLES.includes(r));

  const columns: ColumnDef<MeasurementInstrument>[] = [
    {
      key: 'code', header: 'Nummer', pinned: true, sortable: true, sortKey: 'code',
      render: (m) => (
        <button
          onClick={() => navigate(`/meetmiddelen/${m.id}`)}
          className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
        >
          {m.code}
        </button>
      ),
    },
    { key: 'brand', header: 'Merk', sortable: true, sortKey: 'brand', render: (m) => m.brand },
    { key: 'type', header: 'Type', sortable: true, sortKey: 'type', render: (m) => m.type },
    { key: 'serialNumber', header: 'Serienr.', render: (m) => m.serialNumber || '—' },
    {
      key: 'assignedTo', header: 'Toegewezen aan', groupable: true,
      getFilterValue: (m) => (m.assignedTo ? `${m.assignedTo.firstName} ${m.assignedTo.lastName}`.trim() : 'Op voorraad'),
      render: (m) =>
        m.assignedTo ? (
          <span className="text-gray-700">{`${m.assignedTo.firstName} ${m.assignedTo.lastName}`.trim()}</span>
        ) : (
          <span className="text-gray-400">Op voorraad</span>
        ),
    },
    {
      key: 'calibrationIntervalMonths', header: 'Interval (mnd)', sortable: true, sortKey: 'calibrationIntervalMonths',
      render: (m) => <span className="text-gray-600">{m.calibrationIntervalMonths}</span>,
    },
    {
      key: 'lastCalibrationDate', header: 'Laatste kalibratie', sortable: true, sortKey: 'lastCalibrationDate',
      render: (m) => formatShortDate(m.lastCalibrationDate),
    },
    {
      key: 'nextCalibrationDue', header: 'Verloopt', sortable: true, sortKey: 'nextCalibrationDue',
      render: (m) => formatShortDate(m.nextCalibrationDue),
    },
    {
      key: 'calibrationStatus', header: 'Kalibratiestatus', filterable: true, filterType: 'select', groupable: true,
      getFilterValue: (m) => m.calibrationStatus ?? 'GEEN_KALIBRATIE',
      render: (m) => <StatusBadge map={MEETMIDDEL_KALIBRATIE_STATUS} status={m.calibrationStatus ?? 'GEEN_KALIBRATIE'} />,
    },
    {
      key: 'status', header: 'Status', defaultVisible: false, filterable: true, filterType: 'select', groupable: true,
      getFilterValue: (m) => m.status,
      render: (m) => <StatusBadge map={MEETMIDDEL_STATUS} status={m.status} />,
    },
  ];

  const {
    activeColumns, filteredData, pendingColumnConfig, setPendingColumnConfig,
    pendingFilters, setPendingFilters, pendingGrouping, setPendingGrouping,
    applyColumns, applyFilters, resetToDefaults, isColumnsDirty, isFiltersDirty,
    allColumns, sort, toggleSort,
  } = useTableConfig({ pageKey: 'measurement-instruments', columns });

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (error) return <ErrorBox>Fout bij het laden: {(error as Error).message}</ErrorBox>;

  const rows = data?.data ?? [];
  const term = search.trim().toLowerCase();
  const searched = term
    ? rows.filter((r) => [r.code, r.brand, r.type, r.serialNumber].some((v) => v?.toLowerCase().includes(term)))
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
        <PageHeader
          title="Meetmiddelen"
          description="Apparatuur, kalibraties en verloopstatus"
          actions={canManage ? <Button onClick={() => setCreateOpen(true)}>Nieuw meetmiddel</Button> : undefined}
        />

        <CreateMeetmiddelModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input placeholder="Zoeken op nummer, merk, type of serienummer..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <Table
          columns={activeColumns}
          data={filteredData(searched)}
          keyExtractor={(r) => r.id}
          emptyMessage="Geen meetmiddelen gevonden"
          sort={sort}
          onSort={toggleSort}
        />

        <p className="text-sm text-gray-500">{searched.length} resultaten</p>
      </div>
    </DetailPageLayout>
  );
}

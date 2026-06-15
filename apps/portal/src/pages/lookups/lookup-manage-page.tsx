import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Role } from '@/types';
import { Button, Card, ErrorBox, Spinner, Table, useConfirm, useToast, type Column } from '@/components/ui';
import { PageHeader } from '@/components/layout/page-header';
import { useAuth } from '@/providers/auth-provider';
import { getErrorMessage } from '@/lib/api-client';
import { useLookups, useDeleteLookup, type LookupRow } from '@/lib/lookups';
import { LOOKUP_KIND_LABELS, isLookupKind } from './lookup-kinds';
import { LookupEditModal } from './components/lookup-edit-modal';

export default function LookupManagePage() {
  const { kind } = useParams<{ kind: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<LookupRow | null>(null);

  const valid = isLookupKind(kind);
  const { data, isLoading, error } = useLookups(valid ? kind : 'plan-status-types');
  const deleteMutation = useDeleteLookup(valid ? kind : 'plan-status-types');

  if (!valid) {
    return <ErrorBox>Onbekende lookup-soort: {kind}</ErrorBox>;
  }

  const isSuperuser = !!user && user.roles.includes(Role.SUPERUSER);
  const canEditRow = (row: LookupRow) => isSuperuser || !row.isSystem;

  const openCreate = () => { setEditingRow(null); setModalOpen(true); };
  const openEdit = (row: LookupRow) => { setEditingRow(row); setModalOpen(true); };

  const handleDelete = async (row: LookupRow) => {
    const confirmed = await confirm({
      title: 'Waarde verwijderen',
      message: `Weet je zeker dat je "${row.label}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(row.id);
      showToast('Waarde verwijderd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  const columns: Column<LookupRow>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs text-gray-600">{r.code}</span> },
    {
      key: 'label', header: 'Label',
      render: (r) => (
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full border border-gray-200" style={{ backgroundColor: r.color || 'transparent' }} />
          <span className="font-medium text-gray-900">{r.label}</span>
        </span>
      ),
    },
    { key: 'sortOrder', header: 'Volgorde', render: (r) => <span className="text-gray-600">{r.sortOrder}</span> },
    { key: 'isActive', header: 'Actief', render: (r) => <span className={r.isActive ? 'text-green-700' : 'text-gray-400'}>{r.isActive ? 'Ja' : 'Nee'}</span> },
    {
      key: 'isSystem', header: 'Herkomst',
      render: (r) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${r.isSystem ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-800'}`}>
          {r.isSystem ? 'Systeem' : 'Eigen'}
        </span>
      ),
    },
    {
      key: 'actions', header: '',
      render: (r) =>
        canEditRow(r) ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Bewerken</Button>
            {!r.isSystem && <Button variant="ghost" size="sm" onClick={() => handleDelete(r)}>Verwijderen</Button>}
          </div>
        ) : (
          <span className="text-xs text-gray-400">Alleen-lezen</span>
        ),
    },
  ];

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (error) return <ErrorBox>Fout bij het laden: {getErrorMessage(error, '')}</ErrorBox>;

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/lookups')}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Terug naar lookups
      </button>

      <PageHeader
        title={LOOKUP_KIND_LABELS[kind]}
        description="Beheer de waarden voor deze lijst. Systeemwaarden zijn alleen door superusers te wijzigen; eigen waarden overschrijven systeemwaarden met dezelfde code."
        actions={<Button onClick={openCreate}>Toevoegen</Button>}
      />

      <Card>
        <Table columns={columns} data={rows} keyExtractor={(r) => r.id} emptyMessage="Nog geen waarden" />
      </Card>

      <LookupEditModal isOpen={modalOpen} onClose={() => setModalOpen(false)} kind={kind} row={editingRow} />
    </div>
  );
}

// Items-tab van de checklist-items bibliotheek: tabel met zoeken + categorie-filter.
// Systeem-items zijn alleen door SUPERUSER bewerkbaar.

import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Select,
  Spinner,
  Table,
  useConfirm,
  useToast,
  type Column,
} from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useCategories } from '@/lib/categories';
import type { ChecklistItem, Category } from '@/types';
import { useChecklistItems, useDeleteChecklistItem } from '../hooks/use-checklist-items';
import { ChecklistItemModal } from './checklist-item-modal';

interface Props {
  canManage: boolean;
  isSuperuser: boolean;
}

export function ItemsTab({ canManage, isSuperuser }: Props) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ChecklistItem | null>(null);

  const { data: items, isLoading } = useChecklistItems();
  const { data: categories } = useCategories();
  const deleteMutation = useDeleteChecklistItem();

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    (categories ?? []).forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  const categoryOptions = useMemo(
    () => [
      { value: '', label: 'Alle categorieën' },
      ...(categories ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (items ?? []).filter((it) => {
      if (categoryId && it.categoryId !== categoryId) return false;
      if (term && !it.question.toLowerCase().includes(term) && !it.normReference?.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
  }, [items, search, categoryId]);

  const canEditRow = (it: ChecklistItem) => canManage && (isSuperuser || !it.isSystem);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (it: ChecklistItem) => {
    setEditing(it);
    setModalOpen(true);
  };

  const handleDelete = async (it: ChecklistItem) => {
    const confirmed = await confirm({
      title: 'Item verwijderen',
      message: `Weet je zeker dat je "${it.question}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(it.id);
      showToast('Item verwijderd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  const columns: Column<ChecklistItem>[] = [
    {
      key: 'question',
      header: 'Vraag',
      render: (it) => <span className="font-medium text-gray-900">{it.question}</span>,
    },
    {
      key: 'category',
      header: 'Categorie',
      render: (it) => (
        <span className="text-gray-600">
          {it.categoryId ? categoryById.get(it.categoryId)?.name ?? '—' : '—'}
        </span>
      ),
    },
    {
      key: 'normReference',
      header: 'Normverwijzing',
      render: (it) => <span className="text-gray-600">{it.normReference || '—'}</span>,
    },
    {
      key: 'isSystem',
      header: 'Herkomst',
      render: (it) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            it.isSystem ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-800'
          }`}
        >
          {it.isSystem ? 'Systeem' : 'Eigen'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (it) =>
        canEditRow(it) ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => openEdit(it)}>
              Bewerken
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleDelete(it)}>
              Verwijderen
            </Button>
          </div>
        ) : (
          <span className="text-xs text-gray-400">Alleen-lezen</span>
        ),
    },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            placeholder="Zoeken op vraag of normverwijzing..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sm:w-56">
          <Select options={categoryOptions} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} />
        </div>
        {canManage && <Button onClick={openCreate}>Nieuw item</Button>}
      </div>

      <Card>
        <Table
          columns={columns}
          data={filtered}
          keyExtractor={(it) => it.id}
          emptyMessage="Geen checklist-items gevonden"
        />
      </Card>

      <p className="text-sm text-gray-500">
        {filtered.length} {filtered.length !== 1 ? 'items' : 'item'}
      </p>

      <ChecklistItemModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        item={editing}
        asSystem={!editing && isSuperuser}
      />
    </div>
  );
}

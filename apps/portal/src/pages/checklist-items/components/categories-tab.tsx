// Categorieën-tab: beheer de gedeelde categorie-taxonomie (systeem + org).
// Sleepbare lijst (gesorteerd op sortOrder) met toevoegen/bewerken/verwijderen.
// Systeemcategorieën zijn alleen door SUPERUSER bewerkbaar.

import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Spinner,
  SortableList,
  DragHandle,
  useConfirm,
  useToast,
} from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import {
  useCategories,
  useDeleteCategory,
  useReorderCategories,
} from '@/lib/categories';
import type { Category } from '@/types';
import { CategoryModal } from './category-modal';

interface Props {
  canManage: boolean;
  isSuperuser: boolean;
}

export function CategoriesTab({ canManage, isSuperuser }: Props) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: categories, isLoading } = useCategories({ includeInactive: true });
  const deleteMutation = useDeleteCategory();
  const reorder = useReorderCategories();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const all = useMemo(() => categories ?? [], [categories]);
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    all.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [all]);

  const canEditRow = (c: Category) => canManage && (isSuperuser || !c.isSystem);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (c: Category) => {
    setEditing(c);
    setModalOpen(true);
  };

  const handleDelete = async (c: Category) => {
    const confirmed = await confirm({
      title: 'Categorie verwijderen',
      message: `Weet je zeker dat je "${c.name}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(c.id);
      showToast('Categorie verwijderd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  const handleReorder = (orderedIds: string[]) => {
    reorder.mutate(orderedIds.map((id, index) => ({ id, sortOrder: index })));
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <Card
      title={`Categorieën (${all.length})`}
      actions={canManage ? <Button onClick={openCreate}>Nieuwe categorie</Button> : undefined}
    >
      {all.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          Nog geen categorieën.{' '}
          {canManage && 'Klik op "Nieuwe categorie" om te beginnen.'}
        </p>
      ) : (
        <SortableList
          items={all}
          getId={(c) => c.id}
          disabled={!canManage}
          onReorder={handleReorder}
          className="space-y-2"
          renderItem={(category, { dragHandleProps }) => (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
              {canManage && <DragHandle {...dragHandleProps} />}
              <span
                className="inline-block h-4 w-4 flex-shrink-0 rounded-full border border-gray-200"
                style={{ backgroundColor: category.color || 'transparent' }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900">{category.name}</span>
                  {category.parentId && (
                    <span className="text-xs text-gray-400">
                      ↳ {nameById.get(category.parentId) ?? '—'}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      category.isSystem ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {category.isSystem ? 'Systeem' : 'Eigen'}
                  </span>
                  {!category.isActive && (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-400">
                      Inactief
                    </span>
                  )}
                </div>
                {category.description && (
                  <p className="mt-0.5 truncate text-xs text-gray-500">{category.description}</p>
                )}
              </div>
              {canEditRow(category) ? (
                <div className="flex flex-shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(category)}>
                    Bewerken
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(category)}>
                    Verwijderen
                  </Button>
                </div>
              ) : (
                <span className="flex-shrink-0 text-xs text-gray-400">Alleen-lezen</span>
              )}
            </div>
          )}
        />
      )}

      <CategoryModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        category={editing}
        allCategories={all}
        asSystem={!editing && isSuperuser}
      />
    </Card>
  );
}

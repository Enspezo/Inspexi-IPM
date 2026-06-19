// Bibliotheek-picker: kies een bestaand checklist-item om aan de checklist te koppelen.
// Zoeken + categorie-filter; al-gekoppelde items worden verborgen.

import { useMemo, useState } from 'react';
import { Modal, Input, Select, Spinner, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useCategories } from '@/lib/categories';
import { useChecklistItems } from '@/pages/checklist-items/hooks/use-checklist-items';
import { useAddChecklistItem } from '../hooks/use-checklists';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  checklistId: string;
  /** ID's van items die al gekoppeld zijn (worden uit de lijst gefilterd). */
  linkedItemIds: string[];
}

export function ItemPickerModal({ isOpen, onClose, checklistId, linkedItemIds }: Props) {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const { data: items, isLoading } = useChecklistItems();
  const { data: categories } = useCategories();
  const addItem = useAddChecklistItem(checklistId);

  const categoryOptions = useMemo(
    () => [
      { value: '', label: 'Alle categorieën' },
      ...(categories ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories],
  );

  const filtered = useMemo(() => {
    const linked = new Set(linkedItemIds);
    const term = search.trim().toLowerCase();
    return (items ?? []).filter((it) => {
      if (linked.has(it.id)) return false;
      if (categoryId && it.categoryId !== categoryId) return false;
      if (term && !it.question.toLowerCase().includes(term) && !it.normReference?.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
  }, [items, linkedItemIds, search, categoryId]);

  const handleAdd = async (checklistItemId: string) => {
    try {
      await addItem.mutateAsync({ checklistItemId });
      showToast('Item toegevoegd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Toevoegen mislukt'), 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Item toevoegen uit bibliotheek" className="max-w-2xl">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <Input
              placeholder="Zoeken op vraag of normverwijzing..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="sm:w-56">
            <Select
              options={categoryOptions}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            Geen items beschikbaar om toe te voegen.
          </p>
        ) : (
          <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
            {filtered.map((it) => (
              <li key={it.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{it.question}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    {it.normReference && (
                      <span className="text-xs text-gray-500">{it.normReference}</span>
                    )}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        it.isSystem ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {it.isSystem ? 'Systeem' : 'Eigen'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAdd(it.id)}
                  disabled={addItem.isPending}
                  className="flex-shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  Toevoegen
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

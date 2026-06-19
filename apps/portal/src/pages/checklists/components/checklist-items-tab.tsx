// Items-tab van de checklist-detailpagina: sleepbare lijst van gekoppelde items.
// Per rij: vraag + normverwijzing, verplicht-toggle (PATCH), categorie-override (inline), verwijderen.
// Toevoegen gaat via de bibliotheek-picker (ItemPickerModal).

import { useState } from 'react';
import {
  Button,
  Card,
  Input,
  SortableList,
  DragHandle,
  useConfirm,
  useToast,
} from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import type { ChecklistItemLink } from '@/types';
import {
  useReorderChecklistItems,
  useUpdateChecklistItemLink,
  useRemoveChecklistItemLink,
} from '../hooks/use-checklists';
import { ItemPickerModal } from './item-picker-modal';

interface Props {
  checklistId: string;
  itemLinks: ChecklistItemLink[];
  /** Structurele wijzigingen toegestaan (canManage && status CONCEPT). */
  canEdit: boolean;
}

export function ChecklistItemsTab({ checklistId, itemLinks, canEdit }: Props) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const reorder = useReorderChecklistItems(checklistId);
  const updateLink = useUpdateChecklistItemLink(checklistId);
  const removeLink = useRemoveChecklistItemLink(checklistId);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState('');

  const linkedItemIds = itemLinks.map((l) => l.checklistItemId);

  const handleToggleRequired = async (link: ChecklistItemLink) => {
    try {
      await updateLink.mutateAsync({ linkId: link.id, data: { isRequired: !link.isRequired } });
    } catch (err) {
      showToast(getErrorMessage(err, 'Bijwerken mislukt'), 'error');
    }
  };

  const startEditCategory = (link: ChecklistItemLink) => {
    setEditingCategoryId(link.id);
    setCategoryDraft(link.categoryOverride ?? '');
  };

  const saveCategory = async (link: ChecklistItemLink) => {
    try {
      await updateLink.mutateAsync({
        linkId: link.id,
        data: { categoryOverride: categoryDraft.trim() },
      });
      showToast('Categorie bijgewerkt', 'success');
      setEditingCategoryId(null);
    } catch (err) {
      showToast(getErrorMessage(err, 'Bijwerken mislukt'), 'error');
    }
  };

  const handleRemove = async (link: ChecklistItemLink) => {
    const confirmed = await confirm({
      title: 'Item verwijderen',
      message: `Weet je zeker dat je "${link.checklistItem?.question ?? 'dit item'}" uit de checklist wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await removeLink.mutateAsync(link.id);
      showToast('Item verwijderd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  return (
    <Card
      title={`Items (${itemLinks.length})`}
      actions={
        canEdit ? <Button onClick={() => setPickerOpen(true)}>Item toevoegen</Button> : undefined
      }
    >
      {itemLinks.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          Nog geen items gekoppeld.{' '}
          {canEdit && 'Klik op "Item toevoegen" om items uit de bibliotheek te kiezen.'}
        </p>
      ) : (
        <SortableList
          items={itemLinks}
          getId={(l) => l.id}
          disabled={!canEdit}
          onReorder={(ids) => reorder.mutate(ids)}
          className="space-y-2"
          renderItem={(link, { dragHandleProps }) => {
            const item = link.checklistItem;
            const categoryLabel =
              link.categoryOverride ?? item?.category?.name ?? null;
            return (
              <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                {canEdit && <DragHandle {...dragHandleProps} />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {item?.question ?? '(item verwijderd)'}
                    </span>
                    {link.isRequired && (
                      <span className="inline-flex items-center rounded-full bg-danger-50 px-2.5 py-0.5 text-xs font-medium text-danger-700">
                        Verplicht
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    {item?.normReference && <span>{item.normReference}</span>}
                    {categoryLabel && (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                        {categoryLabel}
                      </span>
                    )}
                  </div>

                  {/* Categorie-override inline bewerken */}
                  {canEdit && editingCategoryId === link.id ? (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="w-56">
                        <Input
                          placeholder="Categorie-override"
                          value={categoryDraft}
                          onChange={(e) => setCategoryDraft(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => saveCategory(link)}
                        isLoading={updateLink.isPending}
                      >
                        Opslaan
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingCategoryId(null)}
                      >
                        Annuleren
                      </Button>
                    </div>
                  ) : null}
                </div>

                {canEdit && editingCategoryId !== link.id && (
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleRequired(link)}
                    >
                      {link.isRequired ? 'Optioneel maken' : 'Verplicht maken'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => startEditCategory(link)}>
                      Categorie
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleRemove(link)}>
                      Verwijderen
                    </Button>
                  </div>
                )}
              </div>
            );
          }}
        />
      )}

      <ItemPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        checklistId={checklistId}
        linkedItemIds={linkedItemIds}
      />
    </Card>
  );
}

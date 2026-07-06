import { useState } from 'react';
import { Button, Spinner, TagPill, useConfirm, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import type { DocumentTag } from '@/types';
import {
  useDocumentTags,
  useDeleteDocumentTag,
} from '../hooks/use-document-tags';
import { DocumentTagModal } from './document-tag-modal';

export function DocumentTagsManagement() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data, isLoading } = useDocumentTags({ limit: 100 });
  const deleteMutation = useDeleteDocumentTag();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<DocumentTag | undefined>(undefined);

  const tags = data?.data ?? [];

  const handleCreate = () => {
    setEditingTag(undefined);
    setModalOpen(true);
  };

  const handleEdit = (tag: DocumentTag) => {
    setEditingTag(tag);
    setModalOpen(true);
  };

  const handleDelete = async (tag: DocumentTag) => {
    const confirmed = await confirm({
      title: 'Tag verwijderen',
      message: `Weet u zeker dat u de tag "${tag.name}" wilt verwijderen? De tag verdwijnt van alle documenten.`,
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;

    try {
      await deleteMutation.mutateAsync(tag.id);
      showToast('Tag verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Document-tags</h3>
        <p className="mt-1 text-sm text-gray-500">
          Beheer tags waarmee documenten gelabeld en gefilterd kunnen worden.
          Tags hebben een naam en een kleur.
        </p>
      </div>

      {tags.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-6 py-8 text-center">
          <p className="text-sm text-gray-500">Nog geen document-tags aangemaakt.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 rounded-lg border border-gray-200">
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <TagPill tag={tag} size="md" />
                {tag._count && (
                  <span className="text-xs text-gray-400">
                    {tag._count.documents} document
                    {tag._count.documents !== 1 ? 'en' : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(tag)}
                >
                  Bewerken
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(tag)}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  isLoading={deleteMutation.isPending}
                >
                  Verwijderen
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <Button type="button" variant="secondary" onClick={handleCreate}>
          + Tag toevoegen
        </Button>
      </div>

      <DocumentTagModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTag(undefined);
        }}
        tag={editingTag}
      />
    </div>
  );
}

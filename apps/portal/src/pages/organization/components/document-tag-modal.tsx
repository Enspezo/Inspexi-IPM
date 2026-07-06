import { useEffect, useState } from 'react';
import { Button, Input, Modal, ColorPicker, TagPill, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import type { DocumentTag } from '@/types';
import {
  useCreateDocumentTag,
  useUpdateDocumentTag,
} from '../hooks/use-document-tags';

interface DocumentTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Wanneer gezet: bewerk-modus, anders aanmaken. */
  tag?: DocumentTag;
}

const DEFAULT_COLOR = '#3B82F6';
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function DocumentTagModal({ isOpen, onClose, tag }: DocumentTagModalProps) {
  const { showToast } = useToast();
  const createMutation = useCreateDocumentTag();
  const updateMutation = useUpdateDocumentTag(tag?.id ?? '');

  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(tag?.name ?? '');
      setColor(tag?.color ?? DEFAULT_COLOR);
      setError('');
    }
  }, [isOpen, tag]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Naam is verplicht');
      return;
    }
    if (!HEX_RE.test(color)) {
      setError('Kleur moet een geldige hex-code zijn (bijv. #3B82F6)');
      return;
    }

    try {
      if (tag) {
        await updateMutation.mutateAsync({ name: trimmed, color });
        showToast('Tag bijgewerkt', 'success');
      } else {
        await createMutation.mutateAsync({ name: trimmed, color });
        showToast('Tag aangemaakt', 'success');
      }
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={tag ? 'Tag bewerken' : 'Nieuwe tag'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Naam"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bijv. Keuringsrapport"
          maxLength={50}
          autoFocus
        />

        <ColorPicker label="Kleur" value={color} onChange={setColor} />

        <div>
          <span className="mb-1 block text-sm font-medium text-gray-700">Voorbeeld</span>
          <TagPill tag={{ id: 'preview', name: name.trim() || 'Tag', color }} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={isPending}>
            {tag ? 'Opslaan' : 'Aanmaken'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

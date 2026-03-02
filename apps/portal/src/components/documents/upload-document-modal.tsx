import { useState, useRef } from 'react';
import { Button, Input, Modal, Select, useToast } from '@/components/ui';
import { useUploadDocument } from '@/pages/documents/hooks/use-documents';
import { DocumentEntityType, ContactType } from '@/types';
import type { Contact } from '@/types';
import { useContacts } from '@/pages/contacts/hooks/use-contacts';
import { useRequests } from '@/pages/requests/hooks/use-requests';
import { useQuotes } from '@/pages/quotes/hooks/use-quotes';
import { useProducts } from '@/pages/products/hooks/use-products';
import { useTasks } from '@/pages/tasks/hooks/use-tasks';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType?: DocumentEntityType;
  entityId?: string;
}

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'text/csv',
].join(',');

const entityTypeOptions = [
  { value: '', label: 'Selecteer type...' },
  { value: DocumentEntityType.CONTACT, label: 'Relatie' },
  { value: DocumentEntityType.REQUEST, label: 'Aanvraag' },
  { value: DocumentEntityType.QUOTE, label: 'Offerte' },
  { value: DocumentEntityType.PRODUCT, label: 'Product' },
  { value: DocumentEntityType.TASK, label: 'Taak' },
];

const entityTypeLabel: Record<string, string> = {
  [DocumentEntityType.CONTACT]: 'Relatie',
  [DocumentEntityType.REQUEST]: 'Aanvraag',
  [DocumentEntityType.QUOTE]: 'Offerte',
  [DocumentEntityType.PRODUCT]: 'Product',
  [DocumentEntityType.TASK]: 'Taak',
};

function getContactDisplayName(contact: Contact): string {
  if (contact.type === ContactType.COMPANY) {
    return contact.companyName || '—';
  }
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function UploadDocumentModal({
  isOpen,
  onClose,
  entityType: fixedEntityType,
  entityId: fixedEntityId,
}: UploadDocumentModalProps) {
  const { showToast } = useToast();
  const uploadMutation = useUploadDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStandalone = !fixedEntityType || !fixedEntityId;

  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [fileError, setFileError] = useState('');
  const [selectedEntityType, setSelectedEntityType] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState('');

  // Fetch entity lists for standalone mode
  const { data: contactsData } = useContacts({ limit: 200 });
  const { data: requestsData } = useRequests({ limit: 200 });
  const { data: quotesData } = useQuotes({ limit: 200 });
  const { data: productsData } = useProducts({ limit: 200 });
  const { data: tasksData } = useTasks({ limit: 200 });

  // Build entity options based on selected type
  const entityOptions = (() => {
    if (!isStandalone) return [];
    const opts = [{ value: '', label: 'Selecteer...' }];
    if (selectedEntityType === DocumentEntityType.CONTACT) {
      (contactsData?.data || []).forEach((c) =>
        opts.push({ value: c.id, label: getContactDisplayName(c) }),
      );
    } else if (selectedEntityType === DocumentEntityType.REQUEST) {
      (requestsData?.data || []).forEach((r) =>
        opts.push({ value: r.id, label: r.title }),
      );
    } else if (selectedEntityType === DocumentEntityType.QUOTE) {
      (quotesData?.data || []).forEach((q) =>
        opts.push({ value: q.id, label: q.quoteNumber }),
      );
    } else if (selectedEntityType === DocumentEntityType.PRODUCT) {
      (productsData?.data || []).forEach((p) =>
        opts.push({ value: p.id, label: p.name }),
      );
    } else if (selectedEntityType === DocumentEntityType.TASK) {
      (tasksData?.data || []).forEach((t) =>
        opts.push({ value: t.id, label: t.title }),
      );
    }
    return opts;
  })();

  const entityType = fixedEntityType || (selectedEntityType as DocumentEntityType);
  const entityId = fixedEntityId || selectedEntityId;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFileError('');

    if (selected) {
      if (selected.size > MAX_SIZE) {
        setFileError(`Bestand is te groot (max ${formatBytes(MAX_SIZE)})`);
        setFile(null);
        return;
      }
      setFile(selected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setFileError('Selecteer een bestand');
      return;
    }
    if (!entityType || !entityId) {
      showToast('Selecteer een entiteit om het document aan te koppelen', 'error');
      return;
    }

    try {
      await uploadMutation.mutateAsync({
        file,
        entityType,
        entityId,
        description: description || undefined,
      });
      showToast('Document geüpload', 'success');
      handleClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Uploaden mislukt',
        'error',
      );
    }
  };

  const handleClose = () => {
    setFile(null);
    setDescription('');
    setFileError('');
    if (isStandalone) {
      setSelectedEntityType('');
      setSelectedEntityId('');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Document uploaden">
      <form onSubmit={handleSubmit} className="space-y-4">
        {isStandalone && (
          <>
            <Select
              label="Koppelen aan"
              options={entityTypeOptions}
              value={selectedEntityType}
              onChange={(e) => {
                setSelectedEntityType(e.target.value);
                setSelectedEntityId('');
              }}
            />
            {selectedEntityType && (
              <Select
                label={entityTypeLabel[selectedEntityType] || 'Entiteit'}
                options={entityOptions}
                value={selectedEntityId}
                onChange={(e) => setSelectedEntityId(e.target.value)}
              />
            )}
          </>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Bestand <span className="text-red-500">*</span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
          />
          {file && (
            <p className="mt-1 text-xs text-gray-500">
              {file.name} ({formatBytes(file.size)})
            </p>
          )}
          {fileError && (
            <p className="mt-1 text-xs text-red-600">{fileError}</p>
          )}
        </div>

        <Input
          label="Beschrijving (optioneel)"
          placeholder="Korte omschrijving van het document..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button
            type="submit"
            isLoading={uploadMutation.isPending}
            disabled={!file || (isStandalone && (!entityType || !entityId))}
          >
            Uploaden
          </Button>
        </div>
      </form>
    </Modal>
  );
}

import { useState, useRef } from 'react';
import { Button, Input, Modal, Select, useToast } from '@/components/ui';
import { useUploadDocument } from '@/pages/documents/hooks/use-documents';
import { DocumentEntityType, ContactType } from '@/types';
import type { Contact } from '@/types';
import { useContacts } from '@/pages/contacts/hooks/use-contacts';
import { useLocations } from '@/pages/contacts/hooks/use-locations';
import { useRequests } from '@/pages/requests/hooks/use-requests';
import { useQuotes } from '@/pages/quotes/hooks/use-quotes';
import { useProjects } from '@/pages/projects/hooks/use-projects';
import { useTasks } from '@/pages/tasks/hooks/use-tasks';
import { useProducts } from '@/pages/products/hooks/use-products';
import { usePlanningItems } from '@/pages/planning/hooks/use-planning';
import { useWorkOrders } from '@/pages/work-orders/hooks/use-work-orders';
import { useUsers } from '@/pages/users/hooks/use-users';
import {
  DOCUMENT_ENTITY_LABELS,
  DOCUMENT_ENTITY_LINK_TYPES,
} from '@/lib/document-entities';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType?: DocumentEntityType;
  entityId?: string;
}

interface RecordOption {
  value: string;
  label: string;
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
  ...DOCUMENT_ENTITY_LINK_TYPES.map((type) => ({
    value: type,
    label: DOCUMENT_ENTITY_LABELS[type],
  })),
];

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
  const [selectedEntityType, setSelectedEntityType] = useState<DocumentEntityType | ''>('');
  const [selectedEntityId, setSelectedEntityId] = useState('');

  // Only the chosen link type actually fetches (rules-of-hooks: every hook is
  // called unconditionally at the top level, gated by `enabled`).
  const wants = (type: DocumentEntityType) =>
    isStandalone && selectedEntityType === type;

  const contacts = useContacts({ limit: 200, enabled: wants(DocumentEntityType.CONTACT) });
  const locations = useLocations({ limit: 200, enabled: wants(DocumentEntityType.LOCATION) });
  const requests = useRequests({ limit: 200, enabled: wants(DocumentEntityType.REQUEST) });
  const quotes = useQuotes({ limit: 200, enabled: wants(DocumentEntityType.QUOTE) });
  const projects = useProjects({ limit: 200, enabled: wants(DocumentEntityType.PROJECT) });
  const tasks = useTasks({ limit: 200, enabled: wants(DocumentEntityType.TASK) });
  const products = useProducts({ limit: 200, enabled: wants(DocumentEntityType.PRODUCT) });
  const planning = usePlanningItems({ limit: 200, enabled: wants(DocumentEntityType.PLANNING) });
  const workOrders = useWorkOrders({ limit: 200, enabled: wants(DocumentEntityType.WORK_ORDER) });
  const users = useUsers({ enabled: wants(DocumentEntityType.USER) });

  // Config-driven record sources: one entry per link type maps the matching
  // list-hook result to selectable options. Adding a new type means adding one
  // entry here — a missing record picker can no longer slip through.
  const recordSources: Record<
    DocumentEntityType,
    { isLoading: boolean; options: RecordOption[] }
  > = {
    [DocumentEntityType.CONTACT]: {
      isLoading: contacts.isLoading,
      options: (contacts.data?.data ?? []).map((c) => ({
        value: c.id,
        label: getContactDisplayName(c),
      })),
    },
    [DocumentEntityType.LOCATION]: {
      isLoading: locations.isLoading,
      options: (locations.data?.data ?? []).map((l) => ({
        value: l.id,
        label: l.name,
      })),
    },
    [DocumentEntityType.REQUEST]: {
      isLoading: requests.isLoading,
      options: (requests.data?.data ?? []).map((r) => ({
        value: r.id,
        label: r.title,
      })),
    },
    [DocumentEntityType.QUOTE]: {
      isLoading: quotes.isLoading,
      options: (quotes.data?.data ?? []).map((q) => ({
        value: q.id,
        label: q.quoteNumber,
      })),
    },
    [DocumentEntityType.PROJECT]: {
      isLoading: projects.isLoading,
      options: (projects.data?.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.projectNumber} — ${p.title}`,
      })),
    },
    [DocumentEntityType.TASK]: {
      isLoading: tasks.isLoading,
      options: (tasks.data?.data ?? []).map((t) => ({
        value: t.id,
        label: t.title,
      })),
    },
    [DocumentEntityType.PRODUCT]: {
      isLoading: products.isLoading,
      options: (products.data?.data ?? []).map((p) => ({
        value: p.id,
        label: p.name,
      })),
    },
    [DocumentEntityType.PLANNING]: {
      isLoading: planning.isLoading,
      options: (planning.data?.data ?? []).map((p) => ({
        value: p.id,
        label: p.productName,
      })),
    },
    [DocumentEntityType.WORK_ORDER]: {
      isLoading: workOrders.isLoading,
      options: (workOrders.data?.data ?? []).map((w) => ({
        value: w.id,
        label: w.workOrderNumber,
      })),
    },
    [DocumentEntityType.USER]: {
      isLoading: users.isLoading,
      options: (users.data ?? []).map((u) => ({
        value: u.id,
        label: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
      })),
    },
  };

  const activeSource = selectedEntityType ? recordSources[selectedEntityType] : null;
  const recordOptions: RecordOption[] = [
    { value: '', label: activeSource?.isLoading ? 'Laden...' : 'Selecteer...' },
    ...(activeSource?.options ?? []),
  ];

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
                setSelectedEntityType(e.target.value as DocumentEntityType | '');
                setSelectedEntityId('');
              }}
            />
            {selectedEntityType && (
              <Select
                label={DOCUMENT_ENTITY_LABELS[selectedEntityType] || 'Entiteit'}
                options={recordOptions}
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

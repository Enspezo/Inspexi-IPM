import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ActionMenu,
  Button,
  Spinner,
  Table,
  Modal,
  Input,
  Select,
  useToast,
  RichTextEditor,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useAuth } from '@/providers/auth-provider';
import { Role } from '@/types';
import type { QuoteTemplate } from '@/types';
import {
  useQuoteTemplates,
  useCreateQuoteTemplate,
  useUpdateQuoteTemplate,
  useDeleteQuoteTemplate,
} from './hooks/use-quote-templates';

const adminRoles = [Role.SUPERUSER, Role.ORG_ADMIN];

const schema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  defaultValidityDays: z.coerce.number().min(1, 'Minimaal 1 dag'),
  requiresApproval: z.string(),
});

type FormData = z.infer<typeof schema>;

export default function QuoteTemplatesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<QuoteTemplate | null>(null);

  const { data, isLoading, error } = useQuoteTemplates({ page, limit: 20 });
  const createMutation = useCreateQuoteTemplate();
  const deleteMutation = useDeleteQuoteTemplate();

  const userIsAdmin = user && user.roles.some(r => adminRoles.includes(r));

  const columns: ColumnDef<QuoteTemplate>[] = [
    {
      key: 'name',
      header: 'Naam',
      pinned: true,
      render: (t) => (
        <button
          onClick={() => setEditingTemplate(t)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {t.name}
        </button>
      ),
    },
    {
      key: 'defaultValidityDays',
      header: 'Geldigheidsdagen',
      render: (t) => (
        <span className="text-gray-600">{t.defaultValidityDays}</span>
      ),
    },
    {
      key: 'requiresApproval',
      header: 'Goedkeuring vereist',
      filterable: true,
      filterType: 'boolean',
      getFilterValue: (t) => String(t.requiresApproval),
      render: (t) => (
        <span className={t.requiresApproval ? 'text-green-600' : 'text-gray-500'}>
          {t.requiresApproval ? 'Ja' : 'Nee'}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Actief',
      filterable: true,
      filterType: 'boolean',
      groupable: true,
      getFilterValue: (t) => String(t.isActive),
      render: (t) => (
        <span className={t.isActive ? 'text-green-600' : 'text-gray-500'}>
          {t.isActive ? 'Ja' : 'Nee'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Aangemaakt',
      filterable: true,
      filterType: 'date',
      getFilterValue: (t) => t.createdAt,
      render: (t) => (
        <span className="text-gray-500 text-xs">
          {new Date(t.createdAt).toLocaleDateString('nl-NL')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      pinned: true,
      pinnedPosition: 'end',
      sidebarLabel: 'Acties',
      render: (t) =>
        userIsAdmin && t.isActive ? (
          <Button
            variant="danger"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDeactivate(t.id);
            }}
            isLoading={deleteMutation.isPending}
          >
            Deactiveren
          </Button>
        ) : null,
    },
  ];

  const handleDeactivate = async (id: string) => {
    if (!window.confirm('Weet u zeker dat u deze template wilt deactiveren?')) return;
    try {
      await deleteMutation.mutateAsync(id);
      showToast('Template gedeactiveerd', 'success');
    } catch {
      showToast('Deactiveren mislukt', 'error');
    }
  };

  const {
    activeColumns,
    filteredData,
    pendingColumnConfig,
    setPendingColumnConfig,
    pendingFilters,
    setPendingFilters,
    pendingGrouping,
    setPendingGrouping,
    applyColumns,
    applyFilters,
    resetToDefaults,
    isColumnsDirty,
    isFiltersDirty,
    allColumns,
  } = useTableConfig({ pageKey: 'quote-templates', columns });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-danger-50 p-4 text-sm text-danger-600">
        Fout bij het laden van templates: {error.message}
      </div>
    );
  }

  const templates = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <DetailPageLayout
      sidebar={
        <TableConfigSidebar
          columns={allColumns}
          pendingColumnConfig={pendingColumnConfig}
          onColumnConfigChange={setPendingColumnConfig}
          pendingFilters={pendingFilters}
          onFiltersChange={setPendingFilters}
          pendingGrouping={pendingGrouping}
          onGroupingChange={setPendingGrouping}
          onApplyColumns={applyColumns}
          onApplyFilters={applyFilters}
          onReset={resetToDefaults}
          isColumnsDirty={isColumnsDirty}
          isFiltersDirty={isFiltersDirty}
        />
      }
    >
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Offerte Templates</h2>
          <p className="mt-1 text-sm text-gray-500">
            Beheer offerte templates
          </p>
        </div>
        {userIsAdmin && (
          <ActionMenu
            primaryActions={[
              {
                label: 'Template aanmaken',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                onClick: () => setIsCreateOpen(true),
              },
            ]}
          />
        )}
      </div>

      <Table
        columns={activeColumns}
        data={filteredData(templates)}
        keyExtractor={(t) => t.id}
        emptyMessage="Geen templates gevonden"
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {total} template{total !== 1 ? 's' : ''} gevonden
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Vorige
            </Button>
            <span className="flex items-center px-3 text-sm text-gray-600">
              {page} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Volgende
            </Button>
          </div>
        </div>
      )}

      {/* Create modal */}
      <CreateTemplateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      {/* Edit modal */}
      {editingTemplate && (
        <EditTemplateModal
          isOpen={!!editingTemplate}
          onClose={() => setEditingTemplate(null)}
          template={editingTemplate}
        />
      )}
    </div>
    </DetailPageLayout>
  );
}

// --- Create Template Modal ---

function CreateTemplateModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const createMutation = useCreateQuoteTemplate();
  const [contentBlocks, setContentBlocks] = useState<object | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      defaultValidityDays: 30,
      requiresApproval: 'false',
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await createMutation.mutateAsync({
        name: data.name,
        defaultValidityDays: data.defaultValidityDays,
        requiresApproval: data.requiresApproval === 'true',
        contentBlocks: contentBlocks ?? undefined,
      });
      showToast('Template aangemaakt', 'success');
      reset();
      setContentBlocks(null);
      onClose();
    } catch {
      showToast('Aanmaken mislukt', 'error');
    }
  };

  const handleClose = () => {
    reset();
    setContentBlocks(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Template aanmaken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Naam"
          placeholder="Naam van het template"
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Geldigheidsdagen"
          type="number"
          min={1}
          error={errors.defaultValidityDays?.message}
          {...register('defaultValidityDays')}
        />

        <Select
          label="Goedkeuring vereist"
          options={[
            { value: 'false', label: 'Nee' },
            { value: 'true', label: 'Ja' },
          ]}
          {...register('requiresApproval')}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Standaard inhoud (optioneel)</label>
          <RichTextEditor value={contentBlocks} onChange={setContentBlocks} placeholder="Standaard tekst voor offertes op basis van dit template..." />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={createMutation.isPending}>
            Aanmaken
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// --- Edit Template Modal ---

function EditTemplateModal({
  isOpen,
  onClose,
  template,
}: {
  isOpen: boolean;
  onClose: () => void;
  template: QuoteTemplate;
}) {
  const { showToast } = useToast();
  const updateMutation = useUpdateQuoteTemplate(template.id);
  const [contentBlocks, setContentBlocks] = useState<object | null>(
    (template.contentBlocks as object) ?? null
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: template.name,
      defaultValidityDays: template.defaultValidityDays,
      requiresApproval: template.requiresApproval ? 'true' : 'false',
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync({
        name: data.name,
        defaultValidityDays: data.defaultValidityDays,
        requiresApproval: data.requiresApproval === 'true',
        contentBlocks: contentBlocks ?? undefined,
      });
      showToast('Template bijgewerkt', 'success');
      onClose();
    } catch {
      showToast('Bijwerken mislukt', 'error');
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Template bewerken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Naam"
          placeholder="Naam van het template"
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Geldigheidsdagen"
          type="number"
          min={1}
          error={errors.defaultValidityDays?.message}
          {...register('defaultValidityDays')}
        />

        <Select
          label="Goedkeuring vereist"
          options={[
            { value: 'false', label: 'Nee' },
            { value: 'true', label: 'Ja' },
          ]}
          {...register('requiresApproval')}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Standaard inhoud (optioneel)</label>
          <RichTextEditor value={contentBlocks} onChange={setContentBlocks} placeholder="Standaard tekst voor offertes op basis van dit template..." />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={updateMutation.isPending}>
            Opslaan
          </Button>
        </div>
      </form>
    </Modal>
  );
}

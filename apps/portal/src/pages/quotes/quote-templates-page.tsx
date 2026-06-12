import { getErrorMessage } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import {
  ActionMenu,
  Button,
  ErrorBox,
  Spinner,
  Table,
  Modal,
  Input,
  Badge,
  useConfirm,
  useToast,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useAuth } from '@/providers/auth-provider';
import { Role } from '@/types';
import type { QuoteTemplate, QuoteTemplateType } from '@/types';
import {
  useQuoteTemplates,
  useCreateQuoteTemplate,
  useDeleteQuoteTemplate,
} from './hooks/use-quote-templates';

const adminRoles = [Role.SUPERUSER, Role.ORG_ADMIN];

const createSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
});

type CreateFormData = z.infer<typeof createSchema>;

export default function QuoteTemplatesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const deleteMutation = useDeleteQuoteTemplate();

  const userIsAdmin = user && user.roles.some(r => adminRoles.includes(r));

  const columns: ColumnDef<QuoteTemplate>[] = [
    {
      key: 'name',
      header: 'Naam',
      pinned: true,
      sortable: true,
      sortKey: 'name',
      render: (t) => (
        <Link
          to={`/quote-templates/${t.id}`}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {t.name}
        </Link>
      ),
    },
    {
      key: 'templateType',
      header: 'Type',
      filterable: true,
      filterType: 'select',
      sortable: true,
      sortKey: 'templateType',
      getFilterValue: (t) => t.templateType,
      render: (t) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
            t.templateType === 'DOCX'
              ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
              : 'bg-blue-50 text-blue-700 ring-blue-600/20'
          }`}
        >
          {t.templateType === 'DOCX' ? 'DOCX' : 'Blokken'}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Beschrijving',
      sortable: true,
      render: (t) => (
        <span className="text-gray-600 text-sm truncate max-w-xs block">
          {t.description || '—'}
        </span>
      ),
    },
    {
      key: 'defaultValidityDays',
      header: 'Geldigheidsdagen',
      sortable: true,
      sortKey: 'defaultValidityDays',
      render: (t) => (
        <span className="text-gray-600">{t.defaultValidityDays}</span>
      ),
    },
    {
      key: 'requiresApproval',
      header: 'Goedkeuring vereist',
      filterable: true,
      filterType: 'boolean',
      sortable: true,
      sortKey: 'requiresApproval',
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
      sortable: true,
      sortKey: 'isActive',
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
      sortable: true,
      sortKey: 'createdAt',
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
    const confirmed = await confirm({
      title: 'Template deactiveren',
      message: 'Weet u zeker dat u deze template wilt deactiveren?',
      confirmLabel: 'Deactiveren',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(id);
      showToast('Template gedeactiveerd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Deactiveren mislukt'), 'error');
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
    sort,
    toggleSort,
    apiSort,
  } = useTableConfig({ pageKey: 'quote-templates', columns });

  useEffect(() => {
    setPage(1);
  }, [sort]);

  const { data, isLoading, error } = useQuoteTemplates({
    page,
    limit: 20,
    sortBy: apiSort?.sortBy,
    sortOrder: apiSort?.sortOrder,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorBox>
        Fout bij het laden van templates: {error.message}
      </ErrorBox>
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
      <PageHeader
        title="Offerte Templates"
        description="Beheer offerte templates"
        actions={
          userIsAdmin ? (
            <ActionMenu
              secondaryActions={[
                {
                  label: 'Template aanmaken',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                  onClick: () => setIsCreateOpen(true),
                },
              ]}
            />
          ) : undefined
        }
      />

      <Table
        columns={activeColumns}
        data={filteredData(templates)}
        keyExtractor={(t) => t.id}
        emptyMessage="Geen templates gevonden"
        sort={sort}
        onSort={toggleSort}
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
    </div>
    </DetailPageLayout>
  );
}

// --- Create Template Modal (with type selector) ---

function CreateTemplateModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const createMutation = useCreateQuoteTemplate();
  const [selectedType, setSelectedType] = useState<QuoteTemplateType>('BLOCKS');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '' },
  });

  const onSubmit = async (data: CreateFormData) => {
    try {
      const template = await createMutation.mutateAsync({
        name: data.name,
        templateType: selectedType,
      });
      showToast('Template aangemaakt', 'success');
      reset();
      setSelectedType('BLOCKS');
      onClose();
      navigate(`/quote-templates/${template.id}`);
    } catch (err) {
      showToast(getErrorMessage(err, 'Aanmaken mislukt'), 'error');
    }
  };

  const handleClose = () => {
    reset();
    setSelectedType('BLOCKS');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Template aanmaken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Template type selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Template type
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSelectedType('BLOCKS')}
              className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors ${
                selectedType === 'BLOCKS'
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
              </svg>
              <span className="text-sm font-medium">Blokken sjabloon</span>
              <span className="text-xs text-gray-500">
                Bouw op met tekst, afbeeldingen en offerteregels
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedType('DOCX')}
              className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors ${
                selectedType === 'DOCX'
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <span className="text-sm font-medium">DOCX Sjabloon</span>
              <span className="text-xs text-gray-500">
                Upload een DOCX bestand met {'{{placeholders}}'}
              </span>
            </button>
          </div>
        </div>

        <Input
          label="Naam"
          placeholder="Naam van het template"
          error={errors.name?.message}
          {...register('name')}
        />

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

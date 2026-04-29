import { useState, useEffect } from 'react';
import { DocumentEntityType } from '@/types';
import type { CrmDocument } from '@/types';
import {
  ActionMenu,
  Spinner,
  Table,
  Input,
  Select,
  Button,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useDocuments } from './hooks/use-documents';
import { downloadFile } from '@/lib/download-file';
import { DocumentPreviewModal, UploadDocumentModal } from '@/components/documents';

const entityTypeFilterOptions = [
  { value: '', label: 'Alle types' },
  { value: DocumentEntityType.CONTACT, label: 'Relatie' },
  { value: DocumentEntityType.REQUEST, label: 'Aanvraag' },
  { value: DocumentEntityType.QUOTE, label: 'Offerte' },
  { value: DocumentEntityType.PRODUCT, label: 'Product' },
  { value: DocumentEntityType.TASK, label: 'Taak' },
  { value: DocumentEntityType.USER, label: 'Gebruiker' },
];

const entityTypeLabels: Record<string, string> = {
  [DocumentEntityType.CONTACT]: 'Relatie',
  [DocumentEntityType.REQUEST]: 'Aanvraag',
  [DocumentEntityType.QUOTE]: 'Offerte',
  [DocumentEntityType.PRODUCT]: 'Product',
  [DocumentEntityType.TASK]: 'Taak',
  [DocumentEntityType.USER]: 'Gebruiker',
};

const entityTypeRoutes: Record<string, string> = {
  [DocumentEntityType.CONTACT]: '/contacts',
  [DocumentEntityType.REQUEST]: '/requests',
  [DocumentEntityType.QUOTE]: '/quotes',
  [DocumentEntityType.PRODUCT]: '/products',
  [DocumentEntityType.TASK]: '/tasks',
  [DocumentEntityType.USER]: '/users',
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getMimeLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'Afbeelding';
  if (mimeType.includes('word') || mimeType.includes('wordprocessing')) return 'Word';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'Excel';
  if (mimeType === 'text/csv') return 'CSV';
  if (mimeType === 'application/zip') return 'ZIP';
  return 'Document';
}

function EntityIcon({ type }: { type: DocumentEntityType }) {
  if (type === DocumentEntityType.CONTACT) {
    return (
      <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    );
  }
  if (type === DocumentEntityType.REQUEST) {
    return (
      <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  if (type === DocumentEntityType.QUOTE) {
    return (
      <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 2v5a2 2 0 002 2h5" />
      </svg>
    );
  }
  if (type === DocumentEntityType.PRODUCT) {
    return (
      <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    );
  }
  // TASK
  return (
    <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}

export default function DocumentsPage() {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [onlyMine, setOnlyMine] = useState(() => localStorage.getItem('inspexi:filter-mine:documents') === 'true');
  const [page, setPage] = useState(1);
  const [previewDoc, setPreviewDoc] = useState<CrmDocument | null>(null);

  const handleDownload = async (doc: CrmDocument) => {
    try {
      await downloadFile(doc.id, doc.originalName);
    } catch {
      // Error handled silently
    }
  };

  const columns: ColumnDef<CrmDocument>[] = [
    {
      key: 'originalName',
      header: 'Naam',
      filterable: true,
      filterType: 'text',
      sortable: true,
      sortKey: 'originalName',
      getFilterValue: (doc) => doc.originalName,
      render: (doc) => (
        <button
          onClick={() => setPreviewDoc(doc)}
          className="flex items-center gap-2 text-sm font-medium text-gray-900 hover:text-primary-600 hover:underline"
        >
          <span className="truncate max-w-xs">{doc.originalName}</span>
        </button>
      ),
    },
    {
      key: 'mimeType',
      header: 'Type',
      filterable: true,
      filterType: 'select',
      sortable: true,
      sortKey: 'mimeType',
      filterOptions: [
        { value: 'application/pdf', label: 'PDF' },
        { value: 'image/', label: 'Afbeelding' },
        { value: 'word', label: 'Word' },
        { value: 'excel', label: 'Excel' },
      ],
      getFilterValue: (doc) => doc.mimeType,
      render: (doc) => (
        <span className="text-xs text-gray-500">{getMimeLabel(doc.mimeType)}</span>
      ),
    },
    {
      key: 'size',
      header: 'Grootte',
      sortable: true,
      sortKey: 'size',
      render: (doc) => (
        <span className="whitespace-nowrap text-xs text-gray-500">
          {formatBytes(doc.size)}
        </span>
      ),
    },
    {
      key: 'entityType',
      header: 'Gekoppeld aan',
      filterable: true,
      filterType: 'select',
      filterOptions: entityTypeFilterOptions.filter((o) => o.value !== ''),
      groupable: true,
      sortable: true,
      sortKey: 'entityType',
      getFilterValue: (doc) => doc.entityType,
      render: (doc) => {
        const route = entityTypeRoutes[doc.entityType];
        return (
          <div className="flex items-center gap-1.5">
            <EntityIcon type={doc.entityType} />
            {doc.entityName && route ? (
              <a
                href={`${route}/${doc.entityId}`}
                className="truncate text-xs text-primary-600 hover:underline"
              >
                {doc.entityName}
              </a>
            ) : (
              <span className="text-xs text-gray-500">
                {entityTypeLabels[doc.entityType] || doc.entityType}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'uploadedBy',
      header: 'Eigenaar',
      sortable: true,
      getSortValue: (doc) => doc.uploadedBy ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : '',
      render: (doc) => (
        <span className="text-xs text-gray-500">
          {doc.uploadedBy
            ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`
            : '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Datum',
      filterable: true,
      filterType: 'date',
      sortable: true,
      sortKey: 'createdAt',
      getFilterValue: (doc) => doc.createdAt,
      render: (doc) => (
        <span className="whitespace-nowrap text-xs text-gray-500">
          {new Date(doc.createdAt).toLocaleDateString('nl-NL', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (doc) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPreviewDoc(doc)}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Preview"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
          <button
            onClick={() => handleDownload(doc)}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Downloaden"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        </div>
      ),
    },
  ];

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
  } = useTableConfig({ pageKey: 'documents', columns });

  useEffect(() => {
    setPage(1);
  }, [sort]);

  const { data, isLoading, error } = useDocuments({
    search: search || undefined,
    entityType: (entityTypeFilter as DocumentEntityType) || undefined,
    onlyMine: onlyMine || undefined,
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
      <div className="rounded-lg bg-danger-50 p-4 text-sm text-danger-600">
        Fout bij het laden van documenten: {error.message}
      </div>
    );
  }

  const documents = data?.data || [];
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
            <h2 className="text-2xl font-bold text-gray-900">Documenten</h2>
            <p className="mt-1 text-sm text-gray-500">
              Beheer alle documenten van uw organisatie
            </p>
          </div>
          <ActionMenu
            secondaryActions={[
              {
                label: 'Document uploaden',
                icon: (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                ),
                onClick: () => setIsUploadOpen(true),
              },
            ]}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              placeholder="Zoeken op bestandsnaam..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-48">
            <Select
              options={entityTypeFilterOptions}
              value={entityTypeFilter}
              onChange={(e) => {
                setEntityTypeFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm transition-colors hover:border-gray-400">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              checked={onlyMine}
              onChange={(e) => {
                setOnlyMine(e.target.checked);
                localStorage.setItem('inspexi:filter-mine:documents', String(e.target.checked));
                setPage(1);
              }}
            />
            <span className="text-gray-700">Mijn documenten</span>
          </label>
        </div>

        <Table
          columns={activeColumns}
          data={filteredData(documents)}
          keyExtractor={(d) => d.id}
          emptyMessage="Geen documenten gevonden"
          sort={sort}
          onSort={toggleSort}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {total} document{total !== 1 ? 'en' : ''} gevonden
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
      </div>

      <DocumentPreviewModal
        isOpen={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        document={previewDoc}
      />

      {isUploadOpen && (
        <UploadDocumentModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
        />
      )}
    </DetailPageLayout>
  );
}

import { lazy, Suspense } from 'react';
import { Button, Input, Select, Spinner, ErrorBoundary, ErrorBox } from '@/components/ui';
import { formatFileSize } from '@/lib/format';
import type { QuoteTemplate } from '@/types';

// docx-preview is zwaar; lazy laden zodat de bundel pas binnenkomt wanneer deze
// tab de preview daadwerkelijk rendert.
const DocxPreviewFrame = lazy(() =>
  import('./quote-template-docx-preview-frame').then((m) => ({
    default: m.DocxPreviewFrame,
  })),
);

// ── DOCX: DOCX Bestand tab ─────────────────────────────

export function DocxFileTab({
  template,
  name,
  setName,
  description,
  setDescription,
  defaultValidityDays,
  setDefaultValidityDays,
  requiresApproval,
  setRequiresApproval,
  handleFieldChange,
  userIsAdmin,
  handleDocxUpload,
  isUploadingDocx,
  handleDocxDownload,
  docxPreviewVersion,
}: {
  template: QuoteTemplate;
  name: string;
  setName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  defaultValidityDays: number;
  setDefaultValidityDays: (value: number) => void;
  requiresApproval: string;
  setRequiresApproval: (value: string) => void;
  handleFieldChange: () => void;
  userIsAdmin: boolean;
  handleDocxUpload: () => void;
  isUploadingDocx: boolean;
  handleDocxDownload: () => void;
  docxPreviewVersion: number;
}) {
  return (
    <div className="space-y-6">
      {/* Metadata fields */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
          label="Naam"
          value={name}
          onChange={(e) => { setName(e.target.value); handleFieldChange(); }}
          placeholder="Template naam"
        />
        <Input
          label="Beschrijving"
          value={description}
          onChange={(e) => { setDescription(e.target.value); handleFieldChange(); }}
          placeholder="Korte beschrijving van dit template"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
          label="Geldigheidsdagen"
          type="number"
          min={1}
          value={defaultValidityDays}
          onChange={(e) => { setDefaultValidityDays(Number(e.target.value) || 30); handleFieldChange(); }}
        />
        <Select
          label="Goedkeuring vereist"
          value={requiresApproval}
          options={[
            { value: 'false', label: 'Nee' },
            { value: 'true', label: 'Ja' },
          ]}
          onChange={(e) => { setRequiresApproval(e.target.value); handleFieldChange(); }}
        />
      </div>

      {/* DOCX file section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-gray-700">DOCX Bestand</label>
          {userIsAdmin && (
            <Button
              variant="secondary"
              onClick={handleDocxUpload}
              isLoading={isUploadingDocx}
            >
              {template.docxStorageKey ? 'Nieuw bestand uploaden' : 'DOCX bestand uploaden'}
            </Button>
          )}
        </div>

        {template.docxStorageKey ? (
          <div className="space-y-4">
            {/* File info */}
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{template.docxFileName}</p>
                  <p className="text-xs text-gray-500">
                    {template.docxFileSize ? formatFileSize(template.docxFileSize) : ''}
                    {template.docxRevisions && template.docxRevisions.length > 0 && (
                      <span className="text-gray-400">
                        {' '}· Versie {template.docxRevisions.length + 1}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={handleDocxDownload}>
                Downloaden
              </Button>
            </div>

            {/* Preview */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Preview</label>
              <ErrorBoundary
                key={docxPreviewVersion}
                fallback={() => (
                  <ErrorBox>
                    De DOCX-preview kon niet worden weergegeven. Het bestand is
                    mogelijk beschadigd — download het om het lokaal te openen.
                  </ErrorBox>
                )}
              >
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center py-8">
                      <Spinner size="md" />
                    </div>
                  }
                >
                  <DocxPreviewFrame templateId={template.id} />
                </Suspense>
              </ErrorBoundary>
            </div>
          </div>
        ) : (
          <div
            onClick={userIsAdmin ? handleDocxUpload : undefined}
            className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-gray-300 p-10 text-center ${
              userIsAdmin ? 'cursor-pointer hover:border-primary-400 hover:bg-primary-50/30' : ''
            }`}
          >
            <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-600">
                {userIsAdmin ? 'Klik om een DOCX bestand te uploaden' : 'Nog geen DOCX bestand geüpload'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Het bestand moet de shortcode <code className="bg-gray-100 px-1 rounded">{`{{offerteregels}}`}</code> of <code className="bg-gray-100 px-1 rounded">{`{{quote_lines}}`}</code> bevatten
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import {
  Badge,
  Button,
  Input,
  Select,
  Spinner,
  useToast,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { BlockEditor } from '@/components/block-editor/block-editor';
import { useAuth } from '@/providers/auth-provider';
import { Role } from '@/types';
import type { ContentBlock, QuoteTemplateAttachment, QuoteTemplateRtfRevision } from '@/types';
import {
  useQuoteTemplate,
  useUpdateQuoteTemplate,
  useDeleteQuoteTemplate,
  useTemplateAttachments,
  useUploadTemplateAttachment,
  useDeleteTemplateAttachment,
  useUploadRtfFile,
  useRtfRevisions,
} from './hooks/use-quote-templates';
import { QuoteTemplatePlaceholderPanel } from './components/quote-template-placeholder-panel';
import { getAccessToken } from '@/lib/api-client';

type BlocksTab = 'inhoud' | 'bijlagen' | 'instellingen';
type RtfTab = 'rtf-bestand' | 'revisies' | 'bijlagen' | 'instellingen';
type Tab = BlocksTab | RtfTab;

const adminRoles = [Role.SUPERUSER, Role.ORG_ADMIN];

export default function QuoteTemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const { data: template, isLoading, error } = useQuoteTemplate(id!);
  const updateMutation = useUpdateQuoteTemplate(id!);
  const deleteMutation = useDeleteQuoteTemplate();
  const { data: attachments } = useTemplateAttachments(id!);
  const uploadAttachmentMutation = useUploadTemplateAttachment(id!);
  const deleteAttachmentMutation = useDeleteTemplateAttachment(id!);
  const uploadRtfMutation = useUploadRtfFile(id!);
  const { data: rtfRevisions } = useRtfRevisions(id!);

  const userIsAdmin = user && user.roles.some((r) => adminRoles.includes(r));
  const isRtf = template?.templateType === 'RTF';

  const [activeTab, setActiveTab] = useState<Tab>('inhoud');

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultValidityDays, setDefaultValidityDays] = useState(30);
  const [requiresApproval, setRequiresApproval] = useState('false');
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);

  // Autosave state
  const [isDirty, setIsDirty] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(true);

  // Active editor ref for placeholder insertion (blocks mode)
  const activeEditorRef = useRef<Editor | null>(null);

  // Initialize form when template loads
  useEffect(() => {
    if (!template) return;
    setName(template.name);
    setDescription(template.description || '');
    setDefaultValidityDays(template.defaultValidityDays);
    setRequiresApproval(template.requiresApproval ? 'true' : 'false');

    // Set default tab based on type
    if (template.templateType === 'RTF') {
      setActiveTab('rtf-bestand');
    } else {
      setActiveTab('inhoud');
    }

    // Detect legacy format and convert (blocks templates only)
    if (template.templateType === 'BLOCKS') {
      const cb = template.contentBlocks;
      if (Array.isArray(cb) && cb.length > 0 && cb[0].id) {
        setBlocks(cb as ContentBlock[]);
      } else if (cb && typeof cb === 'object' && (cb as any).type === 'doc') {
        setBlocks([
          {
            id: crypto.randomUUID(),
            type: 'rich_text',
            width: 'full',
            order: 0,
            content: { tiptapJson: cb },
          },
          {
            id: crypto.randomUUID(),
            type: 'quote_lines',
            width: 'full',
            order: 1,
            content: { title: 'Offerteregels' },
          },
        ]);
      } else {
        setBlocks([]);
      }
    }

    initialLoadRef.current = true;
  }, [template]);

  // Track dirty state
  const handleBlocksChange = useCallback((newBlocks: ContentBlock[]) => {
    setBlocks(newBlocks);
    if (!initialLoadRef.current) {
      setIsDirty(true);
    }
    initialLoadRef.current = false;
  }, []);

  const handleFieldChange = useCallback(() => {
    if (!initialLoadRef.current) {
      setIsDirty(true);
    }
  }, []);

  // Autosave with debounce (metadata + blocks for BLOCKS type, metadata only for RTF)
  useEffect(() => {
    if (!isDirty || !id) return;
    setAutosaveStatus('unsaved');

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

    autosaveTimerRef.current = setTimeout(async () => {
      setAutosaveStatus('saving');
      try {
        const payload: Record<string, any> = {
          name,
          description: description || undefined,
          defaultValidityDays,
          requiresApproval: requiresApproval === 'true',
        };
        if (!isRtf) {
          payload.contentBlocks = blocks;
        }
        await updateMutation.mutateAsync(payload);
        setLastSaved(new Date());
        setAutosaveStatus('saved');
        setIsDirty(false);
      } catch {
        setAutosaveStatus('error');
      }
    }, 3000);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, name, description, blocks, defaultValidityDays, requiresApproval, id, isRtf]);

  // Manual save with validation
  const handleManualSave = async () => {
    if (!isRtf) {
      const hasQuoteLines = blocks.some((b) => b.type === 'quote_lines');
      if (!hasQuoteLines) {
        showToast('Een "Offerteregels" blok is verplicht', 'error');
        return;
      }
    }

    if (!name.trim()) {
      showToast('Naam is verplicht', 'error');
      return;
    }

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

    setAutosaveStatus('saving');
    try {
      const payload: Record<string, any> = {
        name,
        description: description || undefined,
        defaultValidityDays,
        requiresApproval: requiresApproval === 'true',
      };
      if (!isRtf) {
        payload.contentBlocks = blocks;
      }
      await updateMutation.mutateAsync(payload);
      setLastSaved(new Date());
      setAutosaveStatus('saved');
      setIsDirty(false);
      showToast('Template opgeslagen', 'success');
    } catch {
      setAutosaveStatus('error');
      showToast('Opslaan mislukt', 'error');
    }
  };

  // Placeholder insertion (blocks mode)
  const handleInsertPlaceholder = useCallback((placeholder: string) => {
    if (activeEditorRef.current) {
      activeEditorRef.current.chain().focus().insertContent(placeholder).run();
    } else {
      showToast('Selecteer eerst een tekstblok', 'info');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deactivate
  const handleDeactivate = async () => {
    if (!window.confirm('Weet u zeker dat u dit template wilt deactiveren?')) return;
    try {
      await deleteMutation.mutateAsync(id!);
      showToast('Template gedeactiveerd', 'success');
      navigate('/quote-templates');
    } catch {
      showToast('Deactiveren mislukt', 'error');
    }
  };

  // Attachment upload
  const handleAttachmentUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png,.svg,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.zip';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      try {
        await uploadAttachmentMutation.mutateAsync(formData);
        showToast('Bijlage toegevoegd', 'success');
      } catch {
        showToast('Upload mislukt', 'error');
      }
    };
    input.click();
  };

  // Attachment download
  const handleAttachmentDownload = async (att: QuoteTemplateAttachment) => {
    const token = getAccessToken();
    try {
      const res = await fetch(
        `/api/v1/quote-templates/${id}/attachments/${att.id}/download`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Download mislukt', 'error');
    }
  };

  // Attachment delete
  const handleAttachmentDelete = async (attId: string) => {
    if (!window.confirm('Bijlage verwijderen?')) return;
    try {
      await deleteAttachmentMutation.mutateAsync(attId);
      showToast('Bijlage verwijderd', 'success');
    } catch {
      showToast('Verwijderen mislukt', 'error');
    }
  };

  // RTF file upload
  const handleRtfUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.rtf';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      try {
        await uploadRtfMutation.mutateAsync(formData);
        showToast('RTF bestand geüpload', 'success');
      } catch (err: any) {
        const msg = err?.message || 'Upload mislukt';
        showToast(msg, 'error');
      }
    };
    input.click();
  };

  // RTF download
  const handleRtfDownload = async () => {
    const token = getAccessToken();
    try {
      const res = await fetch(
        `/api/v1/quote-templates/${id}/rtf/download`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = template?.rtfFileName || 'template.rtf';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Download mislukt', 'error');
    }
  };

  // RTF revision download
  const handleRevisionDownload = async (revision: QuoteTemplateRtfRevision) => {
    const token = getAccessToken();
    try {
      const res = await fetch(
        `/api/v1/quote-templates/${id}/rtf/revisions/${revision.id}/download`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = revision.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Download mislukt', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="rounded-lg bg-danger-50 p-4 text-sm text-danger-600">
        Template niet gevonden.
      </div>
    );
  }

  // Build tabs based on template type
  const tabs: { key: Tab; label: string }[] = isRtf
    ? [
        { key: 'rtf-bestand', label: 'RTF Bestand' },
        { key: 'revisies', label: `Revisies${rtfRevisions?.length ? ` (${rtfRevisions.length})` : ''}` },
        { key: 'bijlagen', label: `Bijlagen${attachments?.length ? ` (${attachments.length})` : ''}` },
        { key: 'instellingen', label: 'Instellingen' },
      ]
    : [
        { key: 'inhoud', label: 'Inhoud' },
        { key: 'bijlagen', label: `Bijlagen${attachments?.length ? ` (${attachments.length})` : ''}` },
        { key: 'instellingen', label: 'Instellingen' },
      ];

  return (
    <DetailPageLayout
      sidebar={
        <div className="space-y-6">
          <QuoteTemplatePlaceholderPanel
            onInsert={handleInsertPlaceholder}
            rtfMode={isRtf}
          />
          <div className="border-t border-gray-200 pt-4">
            <AuditHistory entityType="QuoteTemplate" entityId={id} />
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate('/quote-templates')}
            className="mb-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Terug naar templates
          </button>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">{name || 'Nieuw template'}</h2>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                  isRtf
                    ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
                    : 'bg-blue-50 text-blue-700 ring-blue-600/20'
                }`}
              >
                {isRtf ? 'RTF' : 'Blokken'}
              </span>
              {!template.isActive && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  Inactief
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <AutosaveIndicator status={autosaveStatus} lastSaved={lastSaved} />
              {userIsAdmin && (
                <Button onClick={handleManualSave} isLoading={updateMutation.isPending}>
                  Opslaan
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── BLOCKS: Inhoud tab ─────────────────────────────── */}
        {activeTab === 'inhoud' && !isRtf && (
          <div className="space-y-6">
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Inhoud</label>
              <BlockEditor
                blocks={blocks}
                onChange={handleBlocksChange}
                templateId={id!}
                activeEditorRef={activeEditorRef}
              />
            </div>
          </div>
        )}

        {/* ── RTF: RTF Bestand tab ──────────────────────────── */}
        {activeTab === 'rtf-bestand' && isRtf && (
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

            {/* RTF file section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">RTF Bestand</label>
                {userIsAdmin && (
                  <Button
                    variant="secondary"
                    onClick={handleRtfUpload}
                    isLoading={uploadRtfMutation.isPending}
                  >
                    {template.rtfStorageKey ? 'Nieuw bestand uploaden' : 'RTF bestand uploaden'}
                  </Button>
                )}
              </div>

              {template.rtfStorageKey ? (
                <div className="space-y-4">
                  {/* File info */}
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{template.rtfFileName}</p>
                        <p className="text-xs text-gray-500">
                          {template.rtfFileSize ? formatFileSize(template.rtfFileSize) : ''}
                          {template.rtfRevisions && template.rtfRevisions.length > 0 && (
                            <span className="text-gray-400">
                              {' '}· Versie {template.rtfRevisions.length + 1}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={handleRtfDownload}>
                      Downloaden
                    </Button>
                  </div>

                  {/* Preview */}
                  {template.rtfPreviewHtml && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Preview</label>
                      <RtfPreviewFrame html={template.rtfPreviewHtml} />
                    </div>
                  )}
                </div>
              ) : (
                <div
                  onClick={userIsAdmin ? handleRtfUpload : undefined}
                  className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-gray-300 p-10 text-center ${
                    userIsAdmin ? 'cursor-pointer hover:border-primary-400 hover:bg-primary-50/30' : ''
                  }`}
                >
                  <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      {userIsAdmin ? 'Klik om een RTF bestand te uploaden' : 'Nog geen RTF bestand geüpload'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Het bestand moet de shortcode <code className="bg-gray-100 px-1 rounded">[[offerteregels]]</code> of <code className="bg-gray-100 px-1 rounded">[[quote_lines]]</code> bevatten
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── RTF: Revisies tab ─────────────────────────────── */}
        {activeTab === 'revisies' && isRtf && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Revisiegeschiedenis</h3>
              <p className="text-sm text-gray-500">
                Eerdere versies van het RTF bestand worden hier bewaard.
              </p>
            </div>

            {rtfRevisions && rtfRevisions.length > 0 ? (
              <div className="divide-y divide-gray-200 rounded-lg border border-gray-200">
                {rtfRevisions.map((rev) => (
                  <div key={rev.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-gray-100 text-gray-600 text-xs font-bold">
                        v{rev.version}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{rev.fileName}</p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(rev.fileSize)}
                          {rev.uploadedBy && (
                            <span> · {rev.uploadedBy.firstName} {rev.uploadedBy.lastName}</span>
                          )}
                          {' · '}
                          {new Date(rev.createdAt).toLocaleDateString('nl-NL', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevisionDownload(rev)}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      title="Downloaden"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                Nog geen eerdere versies. Revisies worden automatisch aangemaakt wanneer u een nieuw RTF bestand uploadt.
              </div>
            )}
          </div>
        )}

        {/* ── Bijlagen tab (shared) ──────────────────────────── */}
        {activeTab === 'bijlagen' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Standaard bijlagen</h3>
                <p className="text-sm text-gray-500">
                  Deze bestanden worden automatisch bijgevoegd bij offertes op basis van dit template.
                </p>
              </div>
              {userIsAdmin && (
                <Button
                  variant="secondary"
                  onClick={handleAttachmentUpload}
                  isLoading={uploadAttachmentMutation.isPending}
                >
                  Bijlage toevoegen
                </Button>
              )}
            </div>

            {attachments && attachments.length > 0 ? (
              <div className="divide-y divide-gray-200 rounded-lg border border-gray-200">
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <FileIcon mimeType={att.mimeType} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{att.fileName}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(att.fileSize)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAttachmentDownload(att)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Downloaden"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                      {userIsAdmin && (
                        <button
                          type="button"
                          onClick={() => handleAttachmentDelete(att.id)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Verwijderen"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                Geen standaard bijlagen. Voeg bestanden toe die automatisch meegezonden worden met offertes.
              </div>
            )}
          </div>
        )}

        {/* ── Instellingen tab (shared) ─────────────────────── */}
        {activeTab === 'instellingen' && (
          <div className="space-y-6">
            {userIsAdmin && template.isActive && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <h3 className="text-sm font-medium text-red-800">Gevarenzone</h3>
                <p className="mt-1 text-sm text-red-600">
                  Het deactiveren van dit template zorgt ervoor dat het niet meer gebruikt kan worden voor nieuwe offertes.
                </p>
                <Button
                  variant="danger"
                  className="mt-3"
                  onClick={handleDeactivate}
                  isLoading={deleteMutation.isPending}
                >
                  Template deactiveren
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </DetailPageLayout>
  );
}

// ── RTF Preview Frame ────────────────────────────────────

function RtfPreviewFrame({ html }: { html: string }) {
  // Highlight [[...]] placeholders in the preview
  const highlightedHtml = html.replace(
    /\[\[(.*?)\]\]/g,
    '<span style="background-color:#FEF3C7;padding:0 2px;border-radius:2px;font-family:monospace;font-size:0.9em;color:#92400E">[[$1]]</span>',
  );

  // Wrap with basic styles for the iframe
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 1.5rem; margin: 0; color: #111827; line-height: 1.6; }
  .rtf-preview { max-width: 100%; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; }
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>${highlightedHtml}</body>
</html>`;

  return (
    <iframe
      srcDoc={fullHtml}
      sandbox=""
      className="w-full rounded-lg border border-gray-200 bg-white"
      style={{ minHeight: '500px' }}
      title="RTF Preview"
    />
  );
}

// ── Autosave indicator ───────────────────────────────────

function AutosaveIndicator({
  status,
  lastSaved,
}: {
  status: 'saved' | 'saving' | 'unsaved' | 'error';
  lastSaved: Date | null;
}) {
  const colors = {
    saved: 'text-green-600',
    saving: 'text-gray-500',
    unsaved: 'text-yellow-600',
    error: 'text-red-600',
  };

  const labels = {
    saved: 'Opgeslagen',
    saving: 'Opslaan...',
    unsaved: 'Niet-opgeslagen wijzigingen',
    error: 'Opslaan mislukt',
  };

  return (
    <div className={`flex items-center gap-1.5 text-xs ${colors[status]}`}>
      {status === 'saving' ? (
        <Spinner size="sm" />
      ) : (
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            status === 'saved'
              ? 'bg-green-500'
              : status === 'unsaved'
                ? 'bg-yellow-500'
                : status === 'error'
                  ? 'bg-red-500'
                  : 'bg-gray-400'
          }`}
        />
      )}
      <span>{labels[status]}</span>
      {status === 'saved' && lastSaved && (
        <span className="text-gray-400">
          {lastSaved.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}

// ── File icon ────────────────────────────────────────────

function FileIcon({ mimeType }: { mimeType: string }) {
  const isPdf = mimeType === 'application/pdf';
  const isImage = mimeType.startsWith('image/');

  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded ${
        isPdf ? 'bg-red-100 text-red-600' : isImage ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
      }`}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

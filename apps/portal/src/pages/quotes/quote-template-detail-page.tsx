import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import { renderAsync as renderDocx } from 'docx-preview';
import {
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
import { Role, EmailTemplateType } from '@/types';
import type { ContentBlock, QuoteTemplateAttachment, QuoteTemplateDocxRevision } from '@/types';
import {
  useQuoteTemplate,
  useUpdateQuoteTemplate,
  useDeleteQuoteTemplate,
  useTemplateAttachments,
  useUploadTemplateAttachment,
  useDeleteTemplateAttachment,
  useUploadDocxFile,
  useDocxRevisions,
} from './hooks/use-quote-templates';
import { useCreateEmailTemplate } from '@/pages/email-templates/hooks/use-email-templates';
import { QuoteTemplatePlaceholderPanel } from './components/quote-template-placeholder-panel';
import { LinkEmailTemplateModal } from './components/link-email-template-modal';
import { FollowUpSection } from './components/follow-up-section';
import { getAccessToken } from '@/lib/api-client';

type BlocksTab = 'inhoud' | 'automatisering' | 'bijlagen' | 'instellingen';
type DocxTab = 'docx-bestand' | 'revisies' | 'automatisering' | 'bijlagen' | 'instellingen';
type Tab = BlocksTab | DocxTab;

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
  const uploadDocxMutation = useUploadDocxFile(id!);
  const { data: docxRevisions } = useDocxRevisions(id!);

  const userIsAdmin = user && user.roles.some((r) => adminRoles.includes(r));
  const isDocx = template?.templateType === 'DOCX';

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

  // Automatisering tab state
  const createEmailTemplateMutation = useCreateEmailTemplate();
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkModalType, setLinkModalType] = useState<EmailTemplateType>(EmailTemplateType.OFFERTE_VERSTUURD);
  const [linkModalField, setLinkModalField] = useState<'sendEmailTemplateId' | 'acceptedEmailTemplateId'>('sendEmailTemplateId');

  // DOCX preview version counter — incremented on upload to force re-render
  const [docxPreviewVersion, setDocxPreviewVersion] = useState(0);

  // Track whether initial tab has been set (avoid resetting on refetch)
  const initialTabSet = useRef(false);

  // Initialize form when template loads
  useEffect(() => {
    if (!template) return;
    setName(template.name);
    setDescription(template.description || '');
    setDefaultValidityDays(template.defaultValidityDays);
    setRequiresApproval(template.requiresApproval ? 'true' : 'false');

    // Set default tab based on type — only on first load
    if (!initialTabSet.current) {
      initialTabSet.current = true;
      if (template.templateType === 'DOCX') {
        setActiveTab('docx-bestand');
      } else {
        setActiveTab('inhoud');
      }
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

  // Autosave with debounce (metadata + blocks for BLOCKS type, metadata only for DOCX)
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
        if (!isDocx) {
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
  }, [isDirty, name, description, blocks, defaultValidityDays, requiresApproval, id, isDocx]);

  // Manual save with validation
  const handleManualSave = async () => {
    if (!isDocx) {
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
      if (!isDocx) {
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

  // DOCX file upload
  const handleDocxUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      try {
        await uploadDocxMutation.mutateAsync(formData);
        setDocxPreviewVersion((v) => v + 1);
        showToast('DOCX bestand geüpload', 'success');
      } catch (err: any) {
        const msg = err?.message || 'Upload mislukt';
        showToast(msg, 'error');
      }
    };
    input.click();
  };

  // DOCX download
  const handleDocxDownload = async () => {
    const token = getAccessToken();
    try {
      const res = await fetch(
        `/api/v1/quote-templates/${id}/docx/download`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = template?.docxFileName || 'template.docx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Download mislukt', 'error');
    }
  };

  // DOCX revision download
  const handleRevisionDownload = async (revision: QuoteTemplateDocxRevision) => {
    const token = getAccessToken();
    try {
      const res = await fetch(
        `/api/v1/quote-templates/${id}/docx/revisions/${revision.id}/download`,
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
  const tabs: { key: Tab; label: string }[] = isDocx
    ? [
        { key: 'docx-bestand', label: 'DOCX Bestand' },
        { key: 'revisies', label: `Revisies${docxRevisions?.length ? ` (${docxRevisions.length})` : ''}` },
        { key: 'automatisering', label: 'Automatisering' },
        { key: 'bijlagen', label: `Bijlagen${attachments?.length ? ` (${attachments.length})` : ''}` },
        { key: 'instellingen', label: 'Instellingen' },
      ]
    : [
        { key: 'inhoud', label: 'Inhoud' },
        { key: 'automatisering', label: 'Automatisering' },
        { key: 'bijlagen', label: `Bijlagen${attachments?.length ? ` (${attachments.length})` : ''}` },
        { key: 'instellingen', label: 'Instellingen' },
      ];

  return (
    <DetailPageLayout
      sidebar={
        <div className="space-y-6">
          <QuoteTemplatePlaceholderPanel
            onInsert={handleInsertPlaceholder}
            docxMode={isDocx}
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
                  isDocx
                    ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
                    : 'bg-blue-50 text-blue-700 ring-blue-600/20'
                }`}
              >
                {isDocx ? 'DOCX' : 'Blokken'}
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
        {activeTab === 'inhoud' && !isDocx && (
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

        {/* ── DOCX: DOCX Bestand tab ─────────────────────────── */}
        {activeTab === 'docx-bestand' && isDocx && (
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
                    isLoading={uploadDocxMutation.isPending}
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
                    <DocxPreviewFrame
                      key={docxPreviewVersion}
                      templateId={template.id}
                    />
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
        )}

        {/* ── DOCX: Revisies tab ─────────────────────────────── */}
        {activeTab === 'revisies' && isDocx && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Revisiegeschiedenis</h3>
              <p className="text-sm text-gray-500">
                Eerdere versies van het DOCX bestand worden hier bewaard.
              </p>
            </div>

            {docxRevisions && docxRevisions.length > 0 ? (
              <div className="divide-y divide-gray-200 rounded-lg border border-gray-200">
                {docxRevisions.map((rev) => (
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
                Nog geen eerdere versies. Revisies worden automatisch aangemaakt wanneer u een nieuw DOCX bestand uploadt.
              </div>
            )}
          </div>
        )}

        {/* ── Automatisering tab (shared) ────────────────────── */}
        {activeTab === 'automatisering' && (
          <div className="space-y-6">
            {/* Section 1: E-mail bij versturen */}
            <EmailTemplateSection
              title="E-mail bij versturen"
              description="Dit e-mailsjabloon wordt gebruikt wanneer een offerte op basis van dit template wordt verstuurd naar de klant."
              linkedTemplate={template.sendEmailTemplate}
              isEnabled={template.sendEmailEnabled}
              templateName={name}
              emailType={EmailTemplateType.OFFERTE_VERSTUURD}
              defaultNamePrefix="Offerte verstuurd"
              userIsAdmin={!!userIsAdmin}
              onUnlink={async () => {
                try {
                  await updateMutation.mutateAsync({ sendEmailTemplateId: null });
                  showToast('E-mailsjabloon ontkoppeld', 'success');
                } catch { showToast('Ontkoppelen mislukt', 'error'); }
              }}
              onCreate={async () => {
                try {
                  const created = await createEmailTemplateMutation.mutateAsync({
                    type: EmailTemplateType.OFFERTE_VERSTUURD,
                    name: `Offerte verstuurd - ${name}`,
                    subject: `Offerte {{offerte.nummer}}`,
                    bodyHtml: '<p>Geachte {{contact.voornaam}} {{contact.achternaam}},</p><p>Hierbij ontvangt u onze offerte.</p>',
                  });
                  await updateMutation.mutateAsync({ sendEmailTemplateId: created.id });
                  showToast('E-mailsjabloon aangemaakt en gekoppeld', 'success');
                  navigate(`/email-templates/${created.id}`);
                } catch { showToast('Aanmaken mislukt', 'error'); }
              }}
              onLinkExisting={() => {
                setLinkModalType(EmailTemplateType.OFFERTE_VERSTUURD);
                setLinkModalField('sendEmailTemplateId');
                setLinkModalOpen(true);
              }}
              onToggleEnabled={async (enabled) => {
                try {
                  await updateMutation.mutateAsync({ sendEmailEnabled: enabled });
                  showToast(enabled ? 'E-mailsjabloon ingeschakeld' : 'E-mailsjabloon uitgeschakeld', 'success');
                } catch { showToast('Wijziging mislukt', 'error'); }
              }}
              isCreating={createEmailTemplateMutation.isPending}
              isUnlinking={updateMutation.isPending}
              navigate={navigate}
            />

            {/* Section 2: Follow-ups */}
            <FollowUpSection
              templateId={id!}
              templateName={name}
              userIsAdmin={!!userIsAdmin}
              navigate={navigate}
            />

            {/* Section 3: E-mail bij acceptatie */}
            <EmailTemplateSection
              title="E-mail bij acceptatie"
              description="Dit e-mailsjabloon wordt als bevestiging gestuurd wanneer de klant een offerte ondertekent en accepteert."
              linkedTemplate={template.acceptedEmailTemplate}
              isEnabled={template.acceptedEmailEnabled}
              templateName={name}
              emailType={EmailTemplateType.OFFERTE_GEACCEPTEERD}
              defaultNamePrefix="Offerte geaccepteerd"
              userIsAdmin={!!userIsAdmin}
              onUnlink={async () => {
                try {
                  await updateMutation.mutateAsync({ acceptedEmailTemplateId: null });
                  showToast('E-mailsjabloon ontkoppeld', 'success');
                } catch { showToast('Ontkoppelen mislukt', 'error'); }
              }}
              onCreate={async () => {
                try {
                  const created = await createEmailTemplateMutation.mutateAsync({
                    type: EmailTemplateType.OFFERTE_GEACCEPTEERD,
                    name: `Offerte geaccepteerd - ${name}`,
                    subject: `Bevestiging ondertekening offerte {{offerte.nummer}}`,
                    bodyHtml: '<p>Geachte {{contact.voornaam}} {{contact.achternaam}},</p><p>Hierbij ontvangt u de bevestiging van uw ondertekening.</p>',
                  });
                  await updateMutation.mutateAsync({ acceptedEmailTemplateId: created.id });
                  showToast('E-mailsjabloon aangemaakt en gekoppeld', 'success');
                  navigate(`/email-templates/${created.id}`);
                } catch { showToast('Aanmaken mislukt', 'error'); }
              }}
              onLinkExisting={() => {
                setLinkModalType(EmailTemplateType.OFFERTE_GEACCEPTEERD);
                setLinkModalField('acceptedEmailTemplateId');
                setLinkModalOpen(true);
              }}
              onToggleEnabled={async (enabled) => {
                try {
                  await updateMutation.mutateAsync({ acceptedEmailEnabled: enabled });
                  showToast(enabled ? 'E-mailsjabloon ingeschakeld' : 'E-mailsjabloon uitgeschakeld', 'success');
                } catch { showToast('Wijziging mislukt', 'error'); }
              }}
              isCreating={createEmailTemplateMutation.isPending}
              isUnlinking={updateMutation.isPending}
              navigate={navigate}
            />
          </div>
        )}

        {/* Link email template modal */}
        <LinkEmailTemplateModal
          isOpen={linkModalOpen}
          onClose={() => setLinkModalOpen(false)}
          type={linkModalType}
          onSelect={async (emailTemplateId) => {
            try {
              await updateMutation.mutateAsync({ [linkModalField]: emailTemplateId });
              showToast('E-mailsjabloon gekoppeld', 'success');
            } catch { showToast('Koppelen mislukt', 'error'); }
          }}
        />

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

// ── DOCX Preview Frame ──────────────────────────────────

function DocxPreviewFrame({ templateId }: { templateId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    setIsLoading(true);
    setError(null);

    const token = getAccessToken();
    fetch(`/api/v1/quote-templates/${templateId}/docx/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then((r) => {
        if (!r.ok) throw new Error('Download mislukt');
        return r.arrayBuffer();
      })
      .then((arrayBuffer) => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = '';
        return renderDocx(arrayBuffer, containerRef.current, undefined, {
          className: 'docx-preview-content',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: true,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });
      })
      .then(() => setIsLoading(false))
      .catch(() => {
        setError('DOCX preview kon niet geladen worden');
        setIsLoading(false);
      });
  }, [templateId]);

  return (
    <div className="overflow-auto rounded-lg border border-gray-200 bg-gray-100" style={{ minHeight: '500px' }}>
      {isLoading && (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="md" />
        </div>
      )}
      {error && (
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      )}
      <div
        ref={containerRef}
        className="docx-preview-wrapper mx-auto"
        style={{ display: isLoading || error ? 'none' : 'block' }}
      />
      <style>{`
        .docx-preview-wrapper .docx-wrapper {
          background: #e5e7eb;
          padding: 16px;
        }
        .docx-preview-wrapper .docx-wrapper > section.docx {
          background: white;
          margin: 0 auto 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06);
          padding: 40px 50px;
          min-height: 600px;
        }
      `}</style>
    </div>
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

// ── Email Template Section (Automatisering tab) ──────────

function EmailTemplateSection({
  title,
  description,
  linkedTemplate,
  isEnabled,
  templateName,
  emailType,
  defaultNamePrefix,
  userIsAdmin,
  onUnlink,
  onCreate,
  onLinkExisting,
  onToggleEnabled,
  isCreating,
  isUnlinking,
  navigate,
}: {
  title: string;
  description: string;
  linkedTemplate?: { id: string; name: string; type: string; subject: string; isActive: boolean } | null;
  isEnabled: boolean;
  templateName: string;
  emailType: EmailTemplateType;
  defaultNamePrefix: string;
  userIsAdmin: boolean;
  onUnlink: () => void;
  onCreate: () => void;
  onLinkExisting: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  isCreating: boolean;
  isUnlinking: boolean;
  navigate: (path: string) => void;
}) {
  return (
    <div className={`rounded-xl border shadow-sm ${linkedTemplate && !isEnabled ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'}`}>
      <div className="border-b border-gray-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${linkedTemplate && !isEnabled ? 'bg-gray-200 text-gray-400' : 'bg-primary-100 text-primary-600'}`}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500">{description}</p>
            </div>
          </div>
          {/* Toggle switch — only shown when a template is linked */}
          {linkedTemplate && userIsAdmin && (
            <button
              type="button"
              role="switch"
              aria-checked={isEnabled}
              onClick={() => onToggleEnabled(!isEnabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                isEnabled ? 'bg-primary-600' : 'bg-gray-200'
              }`}
            >
              <span className="sr-only">{isEnabled ? 'Uitschakelen' : 'Inschakelen'}</span>
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          )}
        </div>
      </div>

      <div className="px-6 py-4">
        {linkedTemplate ? (
          <div>
            {!isEnabled && (
              <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-inset ring-amber-600/20">
                Dit e-mailsjabloon is uitgeschakeld voor dit offertesjabloon. De standaard e-mail wordt gebruikt.
              </div>
            )}
            <div className={`flex items-center justify-between ${!isEnabled ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{linkedTemplate.name}</p>
                  <p className="text-xs text-gray-500">Onderwerp: {linkedTemplate.subject}</p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    linkedTemplate.isActive
                      ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20'
                      : 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-500/20'
                  }`}
                >
                  {linkedTemplate.isActive ? 'Actief' : 'Inactief'}
                </span>
              </div>
              {userIsAdmin && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/email-templates/${linkedTemplate.id}`)}
                  >
                    Bewerken
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onUnlink}
                    isLoading={isUnlinking}
                  >
                    Ontkoppelen
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 mb-4">
              Geen e-mailsjabloon gekoppeld. De standaard e-mail wordt gebruikt.
            </p>
            {userIsAdmin && (
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onCreate}
                  isLoading={isCreating}
                >
                  E-mailsjabloon aanmaken
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onLinkExisting}
                >
                  Bestaand sjabloon koppelen
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

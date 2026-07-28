import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import {
  Button,
  ErrorBox,
  Spinner,
  Tabs,
  useConfirm,
  useToast,
  type TabDef,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { AuditHistory } from '@/components/audit-history/audit-history';
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
import { AutosaveIndicator } from './components/quote-template-autosave-indicator';
import { ContentTab } from './components/quote-template-content-tab';
import { DocxFileTab } from './components/quote-template-docx-file-tab';
import { RevisionsTab } from './components/quote-template-revisions-tab';
import { AttachmentsTab } from './components/quote-template-attachments-tab';
import { AutomationTab } from './components/quote-template-automation-tab';
import { getAccessToken, getErrorMessage } from '@/lib/api-client';

type BlocksTab = 'inhoud' | 'automatisering' | 'bijlagen' | 'instellingen';
type DocxTab = 'docx-bestand' | 'revisies' | 'automatisering' | 'bijlagen' | 'instellingen';
type Tab = BlocksTab | DocxTab;

const adminRoles = [Role.SUPERUSER, Role.ORG_ADMIN];

export default function QuoteTemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();

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
      /* foutmelding wordt centraal getoond via useApiMutation */
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
    const confirmed = await confirm({
      title: 'Template deactiveren',
      message: 'Weet u zeker dat u dit template wilt deactiveren?',
      confirmLabel: 'Deactiveren',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(id!);
      showToast('Template gedeactiveerd', 'success');
      navigate('/quote-templates');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
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
        /* foutmelding wordt centraal getoond via useApiMutation */
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
    } catch (err) {
      showToast(getErrorMessage(err, 'Download mislukt'), 'error');
    }
  };

  // Attachment delete
  const handleAttachmentDelete = async (attId: string) => {
    const confirmed = await confirm({
      title: 'Bijlage verwijderen',
      message: 'Bijlage verwijderen?',
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteAttachmentMutation.mutateAsync(attId);
      showToast('Bijlage verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
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
      } catch {
        /* foutmelding wordt centraal getoond via useApiMutation */
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
    } catch (err) {
      showToast(getErrorMessage(err, 'Download mislukt'), 'error');
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
    } catch (err) {
      showToast(getErrorMessage(err, 'Download mislukt'), 'error');
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
      <ErrorBox>
        Template niet gevonden.
      </ErrorBox>
    );
  }

  // Build tabs based on template type
  const tabs: TabDef<Tab>[] = isDocx
    ? [
        { key: 'docx-bestand', label: 'DOCX Bestand' },
        { key: 'revisies', label: 'Revisies', count: docxRevisions?.length },
        { key: 'automatisering', label: 'Automatisering' },
        { key: 'bijlagen', label: 'Bijlagen', count: attachments?.length },
        { key: 'instellingen', label: 'Instellingen' },
      ]
    : [
        { key: 'inhoud', label: 'Inhoud' },
        { key: 'automatisering', label: 'Automatisering' },
        { key: 'bijlagen', label: 'Bijlagen', count: attachments?.length },
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
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {/* ── BLOCKS: Inhoud tab ─────────────────────────────── */}
        {activeTab === 'inhoud' && !isDocx && (
          <ContentTab
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            defaultValidityDays={defaultValidityDays}
            setDefaultValidityDays={setDefaultValidityDays}
            requiresApproval={requiresApproval}
            setRequiresApproval={setRequiresApproval}
            handleFieldChange={handleFieldChange}
            blocks={blocks}
            handleBlocksChange={handleBlocksChange}
            templateId={id!}
            activeEditorRef={activeEditorRef}
          />
        )}

        {/* ── DOCX: DOCX Bestand tab ─────────────────────────── */}
        {activeTab === 'docx-bestand' && isDocx && (
          <DocxFileTab
            template={template}
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            defaultValidityDays={defaultValidityDays}
            setDefaultValidityDays={setDefaultValidityDays}
            requiresApproval={requiresApproval}
            setRequiresApproval={setRequiresApproval}
            handleFieldChange={handleFieldChange}
            userIsAdmin={!!userIsAdmin}
            handleDocxUpload={handleDocxUpload}
            isUploadingDocx={uploadDocxMutation.isPending}
            handleDocxDownload={handleDocxDownload}
            docxPreviewVersion={docxPreviewVersion}
          />
        )}

        {/* ── DOCX: Revisies tab ─────────────────────────────── */}
        {activeTab === 'revisies' && isDocx && (
          <RevisionsTab
            docxRevisions={docxRevisions}
            handleRevisionDownload={handleRevisionDownload}
          />
        )}

        {/* ── Automatisering tab (shared) ────────────────────── */}
        {activeTab === 'automatisering' && (
          <AutomationTab
            template={template}
            templateId={id!}
            name={name}
            userIsAdmin={!!userIsAdmin}
            updateMutation={updateMutation}
            createEmailTemplateMutation={createEmailTemplateMutation}
            showToast={showToast}
            navigate={navigate}
            setLinkModalType={setLinkModalType}
            setLinkModalField={setLinkModalField}
            setLinkModalOpen={setLinkModalOpen}
          />
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
            } catch { /* foutmelding wordt centraal getoond via useApiMutation */ }
          }}
        />

        {/* ── Bijlagen tab (shared) ──────────────────────────── */}
        {activeTab === 'bijlagen' && (
          <AttachmentsTab
            attachments={attachments}
            userIsAdmin={!!userIsAdmin}
            handleAttachmentUpload={handleAttachmentUpload}
            isUploading={uploadAttachmentMutation.isPending}
            handleAttachmentDownload={handleAttachmentDownload}
            handleAttachmentDelete={handleAttachmentDelete}
          />
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

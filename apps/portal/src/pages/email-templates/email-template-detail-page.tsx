import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Editor } from '@tiptap/react';
import { ActionMenu, Button, Card, ErrorBox, InfoField, Spinner, Input, RichTextEditor, useConfirm } from '@/components/ui';
import { formatFileSize } from '@/lib/format';
import { sanitizeHtml } from '@/lib/sanitize-html';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { useToast } from '@/components/ui';
import { getAccessToken, getErrorMessage } from '@/lib/api-client';
import {
  useEmailTemplate,
  useUpdateEmailTemplate,
  usePreviewEmailTemplate,
  useDuplicateEmailTemplate,
  useEmailTemplateAttachments,
  useUploadEmailTemplateAttachment,
  useDeleteEmailTemplateAttachment,
} from './hooks/use-email-templates';
import { PlaceholderPanel } from './components/placeholder-panel';
import { EMAIL_TYPE_LABELS } from './components/email-type-labels';
import type { EmailTemplateType, EmailTemplateAttachment } from '@/types';

type Tab = 'bewerken' | 'voorbeeld' | 'bijlagen';

const templateMetaSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  subject: z.string().min(1, 'Onderwerp is verplicht'),
});

type TemplateMetaFormData = z.infer<typeof templateMetaSchema>;

export default function EmailTemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: template, isLoading, error } = useEmailTemplate(id!);
  const updateMutation = useUpdateEmailTemplate(id!);
  const previewMutation = usePreviewEmailTemplate();
  const duplicateMutation = useDuplicateEmailTemplate();

  const { data: attachments } = useEmailTemplateAttachments(id!);
  const uploadAttachmentMutation = useUploadEmailTemplateAttachment(id!);
  const deleteAttachmentMutation = useDeleteEmailTemplateAttachment(id!);

  const [activeTab, setActiveTab] = useState<Tab>('bewerken');
  const [isEditing, setIsEditing] = useState(false);
  const [bodyJson, setBodyJson] = useState<object | null>(null);
  const [bodyHtml, setBodyHtml] = useState('');
  const [isBodyDirty, setIsBodyDirty] = useState(false);

  const editorRef = useRef<Editor | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);

  // Metadata-formulier (naam + onderwerp)
  const {
    register,
    handleSubmit,
    reset: resetForm,
    setValue: setFormValue,
    getValues,
    formState: { errors: formErrors, isDirty: isMetaDirty },
  } = useForm<TemplateMetaFormData>({ resolver: zodResolver(templateMetaSchema) });

  // Initialize form state when template loads
  useEffect(() => {
    if (template) {
      resetForm({ name: template.name, subject: template.subject });
      setBodyJson(template.bodyJson);
      setBodyHtml(template.bodyHtml);
      setIsBodyDirty(false);
    }
  }, [template, resetForm]);

  const onSubmitMeta = async (data: TemplateMetaFormData) => {
    try {
      await updateMutation.mutateAsync({
        name: data.name,
        subject: data.subject,
      });
      showToast('Sjabloongegevens opgeslagen', 'success');
      setIsEditing(false);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleCancelEdit = () => {
    if (template) {
      resetForm({ name: template.name, subject: template.subject });
    }
    setIsEditing(false);
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        bodyJson: bodyJson ?? undefined,
        bodyHtml,
      });
      showToast('Sjabloon opgeslagen', 'success');
      setIsBodyDirty(false);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleToggleActive = async () => {
    if (!template) return;
    const newActive = !template.isActive;
    const msg = newActive ? 'activeren' : 'deactiveren';
    const confirmed = await confirm({
      title: newActive ? 'Sjabloon activeren' : 'Sjabloon deactiveren',
      message: `Weet u zeker dat u dit sjabloon wilt ${msg}?`,
      confirmLabel: newActive ? 'Activeren' : 'Deactiveren',
      ...(newActive ? { variant: 'primary' as const } : {}),
    });
    if (!confirmed) return;
    try {
      await updateMutation.mutateAsync({ isActive: newActive });
      showToast(`Sjabloon ${newActive ? 'geactiveerd' : 'gedeactiveerd'}`, 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleDuplicate = async () => {
    try {
      const result = await duplicateMutation.mutateAsync(id!);
      showToast('Sjabloon gedupliceerd', 'success');
      navigate(`/email-templates/${result.id}`);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handlePreview = async () => {
    if (!template) return;
    setActiveTab('voorbeeld');
    previewMutation.mutate({
      subject: getValues('subject') || template.subject,
      bodyHtml,
      type: template.type,
    });
  };

  const handleInsertPlaceholder = (placeholder: string) => {
    // Try inserting into the rich text editor
    if (editorRef.current) {
      editorRef.current.chain().focus().insertContent(placeholder).run();
      setIsBodyDirty(true);
    }
  };

  const handleInsertPlaceholderInSubject = (placeholder: string) => {
    const input = subjectRef.current;
    if (!input) return;
    const subject = getValues('subject') ?? '';
    const start = input.selectionStart ?? subject.length;
    const end = input.selectionEnd ?? subject.length;
    const newSubject = subject.slice(0, start) + placeholder + subject.slice(end);
    setFormValue('subject', newSubject, { shouldDirty: true });
    // Restore cursor position after React re-render
    setTimeout(() => {
      input.focus();
      const newPos = start + placeholder.length;
      input.setSelectionRange(newPos, newPos);
    }, 0);
  };

  // ─── Attachment handlers ──────────────────────────────

  const handleAttachmentUpload = () => {
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

  const handleAttachmentDownload = async (att: EmailTemplateAttachment) => {
    const token = getAccessToken();
    try {
      const res = await fetch(
        `/api/v1/email-templates/${id}/attachments/${att.id}/download`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.originalName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(getErrorMessage(err, 'Download mislukt'), 'error');
    }
  };

  const handleAttachmentDelete = async (attachmentId: string) => {
    const confirmed = await confirm({
      title: 'Bijlage verwijderen',
      message: 'Bijlage verwijderen?',
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteAttachmentMutation.mutateAsync(attachmentId);
      showToast('Bijlage verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
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
      <ErrorBox>Sjabloon niet gevonden</ErrorBox>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'bewerken', label: 'Bewerken' },
    { key: 'voorbeeld', label: 'Voorbeeld' },
    { key: 'bijlagen', label: `Bijlagen${attachments?.length ? ` (${attachments.length})` : ''}` },
  ];

  return (
    <DetailPageLayout
      sidebar={
        <AuditHistory entityType="EmailTemplate" entityId={id} />
      }
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/email-templates')}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{template.name}</h2>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                {EMAIL_TYPE_LABELS[template.type as EmailTemplateType] ?? template.type}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  template.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {template.isActive ? 'Actief' : 'Inactief'}
              </span>
            </div>
          </div>
          <ActionMenu
            primaryActions={[
              {
                label: template.isActive ? 'Deactiveren' : 'Activeren',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={template.isActive ? 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'} /></svg>,
                onClick: handleToggleActive,
                variant: template.isActive ? 'danger' as const : undefined,
              },
            ]}
            secondaryActions={[
              {
                label: 'Dupliceren',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
                onClick: handleDuplicate,
              },
            ]}
          />
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  if (tab.key === 'voorbeeld') {
                    handlePreview();
                  } else {
                    setActiveTab(tab.key);
                  }
                }}
                className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        {activeTab === 'bewerken' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Editor (left 2/3) */}
            <div className="lg:col-span-2 space-y-4">
              {/* Sjabloongegevens (naam + onderwerp) */}
              <Card>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Sjabloongegevens</h3>
                  {!isEditing && (
                    <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
                      Bewerken
                    </Button>
                  )}
                </div>
                {isEditing ? (
                  <form onSubmit={handleSubmit(onSubmitMeta)} className="space-y-4">
                    <Input
                      label="Naam"
                      error={formErrors.name?.message}
                      {...register('name')}
                    />
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-gray-700">
                          Onderwerp
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            // Focus subject input so next placeholder insert goes there
                            subjectRef.current?.focus();
                          }}
                          className="text-xs text-primary-600 hover:text-primary-800"
                        >
                          Variabele invoegen in onderwerp
                        </button>
                      </div>
                      {(() => {
                        const { ref: subjectFieldRef, ...subjectField } = register('subject');
                        return (
                          <input
                            {...subjectField}
                            ref={(el) => {
                              subjectFieldRef(el);
                              subjectRef.current = el;
                            }}
                            type="text"
                            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                            placeholder="Onderwerp van de e-mail..."
                          />
                        );
                      })()}
                      {formErrors.subject?.message && (
                        <p className="mt-1 text-sm text-red-600">{formErrors.subject.message}</p>
                      )}
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                      <Button type="button" variant="secondary" onClick={handleCancelEdit}>
                        Annuleren
                      </Button>
                      <Button type="submit" disabled={!isMetaDirty} isLoading={updateMutation.isPending}>
                        Opslaan
                      </Button>
                    </div>
                  </form>
                ) : (
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <InfoField label="Naam" value={template.name} />
                    <InfoField label="Onderwerp" value={template.subject} />
                  </dl>
                )}
              </Card>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Inhoud
                </label>
                <RichTextEditor
                  value={bodyJson}
                  onChange={(json) => { setBodyJson(json); setIsBodyDirty(true); }}
                  onHtmlChange={setBodyHtml}
                  placeholder="Schrijf hier de inhoud van de e-mail..."
                  editorRef={editorRef}
                />
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => navigate('/email-templates')}
                >
                  Annuleren
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!isBodyDirty || updateMutation.isPending}
                  isLoading={updateMutation.isPending}
                >
                  Opslaan
                </Button>
              </div>
            </div>

            {/* Placeholder panel (right 1/3) */}
            <div className="lg:border-l lg:pl-6">
              <PlaceholderPanel
                templateType={template.type as EmailTemplateType}
                onInsert={(placeholder) => {
                  // Check if subject input is focused
                  if (document.activeElement === subjectRef.current) {
                    handleInsertPlaceholderInSubject(placeholder);
                  } else {
                    handleInsertPlaceholder(placeholder);
                  }
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'voorbeeld' && (
          <div className="space-y-4">
            {previewMutation.isPending && (
              <div className="flex h-32 items-center justify-center">
                <Spinner size="lg" />
              </div>
            )}
            {previewMutation.data && (
              <div className="space-y-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">Onderwerp:</p>
                  <p className="text-lg font-medium text-gray-900">
                    {previewMutation.data.subject}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-6">
                  <div
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewMutation.data.html) }}
                    className="prose prose-sm max-w-none"
                  />
                </div>
              </div>
            )}
            {previewMutation.error && (
              <ErrorBox>Fout bij genereren preview</ErrorBox>
            )}
          </div>
        )}

        {activeTab === 'bijlagen' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Standaard bijlagen</h3>
                <p className="text-sm text-gray-500">
                  Deze bestanden worden automatisch bijgevoegd wanneer dit e-mailsjabloon wordt gebruikt.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={handleAttachmentUpload}
                isLoading={uploadAttachmentMutation.isPending}
              >
                Bijlage toevoegen
              </Button>
            </div>

            {attachments && attachments.length > 0 ? (
              <div className="divide-y divide-gray-200 rounded-lg border border-gray-200">
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                        <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{att.originalName}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(att.fileSize)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <button
                        onClick={() => handleAttachmentDownload(att)}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Downloaden"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleAttachmentDelete(att.id)}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Verwijderen"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <p className="mt-2 text-sm text-gray-500">
                  Geen standaard bijlagen. Voeg bestanden toe die automatisch meegezonden worden met e-mails van dit type.
                </p>
                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={handleAttachmentUpload}
                  isLoading={uploadAttachmentMutation.isPending}
                >
                  Bijlage toevoegen
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </DetailPageLayout>
  );
}

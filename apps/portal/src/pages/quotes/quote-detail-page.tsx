import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  QuoteStatus,
  Role,
  TaskEntityType,
  TaskStatus,
  DocumentEntityType,
  CustomFieldEntityType,
  NoteEntityType,
} from '@/types';
import { ActionMenu, Button, Card, ErrorBox, Spinner, StatusBadge, Input, Table, useConfirm, useToast, type Column } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/format';
import { APPROVAL_STATUS, getStatusConfig, QUOTE_STATUS } from '@/lib/status';
import { DetailPageLayout, SidebarSection } from '@/components/layout/detail-page-layout';
import { NotesSidebarSection, HistorySidebarSection, DocumentsSidebarSection } from '@/components/layout/sidebar-sections';
import { useAuth } from '@/providers/auth-provider';
import {
  useQuote,
  useUpdateQuote,
  useSubmitApproval,
  useRejectQuote,
  useUpdateQuoteStatus,
  useDeleteQuote,
} from './hooks/use-quotes';
import type { QuoteLine, QuoteApprovalRequest } from '@/types';
import { useContactLogs } from '@/pages/contacts/hooks/use-contacts';
import { AddLogModal } from '@/pages/contacts/components/add-log-modal';
import { useTasks } from '@/pages/tasks/hooks/use-tasks';
import { CreateTaskModal } from '@/pages/tasks/components/create-task-modal';
import { CustomFieldsDisplay } from '@/components/custom-fields';
import { SendQuoteModal } from './components/send-quote-modal';
import { ApproveQuoteModal } from './components/approve-quote-modal';
import { PdfPreviewModal } from './components/pdf-preview-modal';
import { QuoteInfoCard } from './components/quote-detail-info-card';
import { QuoteQuestionsCard } from './components/quote-detail-questions-card';
import { QuoteAttachmentsCard } from './components/quote-detail-attachments-card';
import { QuoteTasksSidebar } from './components/quote-detail-tasks-sidebar';
import { ContactLogsSidebar } from './components/quote-detail-contact-logs-sidebar';
import { formatDateTimeLong } from './components/quote-detail-helpers';
import { RichTextViewer } from '@/components/ui';
import { getAccessToken } from '@/lib/api-client';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];
const canApprove = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER];

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data: quote, isLoading, error } = useQuote(id!);
  const updateQuoteMutation = useUpdateQuote(id!);
  const submitApprovalMutation = useSubmitApproval(id!);
  const rejectMutation = useRejectQuote(id!);
  const updateStatusMutation = useUpdateQuoteStatus(id!);
  const deleteMutation = useDeleteQuote();

  // Fetch contact logs for this quote's contact
  const { data: contactLogs } = useContactLogs(quote?.contactId || '');

  const [rejectNote, setRejectNote] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const { data: tasksData } = useTasks({ entityType: TaskEntityType.QUOTE, entityId: id, limit: 100 });
  const quoteTasks = tasksData?.data || [];
  const incompleteTasks = quoteTasks.filter((t) => t.status !== TaskStatus.VOLTOOID);

  const userCanWrite = user && user.roles.some(r => canWrite.includes(r));
  const userCanApprove = user && user.roles.some(r => canApprove.includes(r));
  // Backend staat bewerken alleen toe bij status CONCEPT (quotes.service.ts update())
  const canEditQuote = !!userCanWrite && quote?.status === QuoteStatus.CONCEPT;

  const handleSubmitApproval = async () => {
    try {
      await submitApprovalMutation.mutateAsync();
      showToast('Offerte ter goedkeuring ingediend', 'success');
    } catch { showToast('Indienen mislukt', 'error'); }
  };

  const handleReject = async () => {
    try {
      await rejectMutation.mutateAsync({ note: rejectNote || undefined });
      showToast('Offerte afgewezen', 'success');
      setRejectNote('');
      setShowRejectInput(false);
    } catch { showToast('Afwijzen mislukt', 'error'); }
  };

  const handleStatusUpdate = async (status: string) => {
    try {
      await updateStatusMutation.mutateAsync({ status });
      showToast('Status bijgewerkt', 'success');
    } catch { showToast('Status wijzigen mislukt', 'error'); }
  };

  const handleDelete = async () => {
    if (!quote) return;
    const confirmed = await confirm({
      title: 'Offerte verwijderen',
      message: 'Weet u zeker dat u deze offerte wilt verwijderen?',
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(quote.id);
      showToast('Offerte verwijderd', 'success');
      navigate('/quotes');
    } catch { showToast('Verwijderen mislukt', 'error'); }
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  }

  if (error || !quote) {
    return <ErrorBox>{error?.message || 'Offerte niet gevonden'}</ErrorBox>;
  }

  const lineColumns: Column<QuoteLine>[] = [
    { key: 'description', header: 'Omschrijving', render: (l) => <span className="text-gray-900">{l.description}</span> },
    { key: 'quantity', header: 'Aantal', render: (l) => <span className="text-gray-600">{l.quantity}</span> },
    { key: 'unit', header: 'Eenheid', render: (l) => <span className="text-gray-600">{l.unit}</span> },
    { key: 'unitPrice', header: 'Eenheidsprijs', render: (l) => <span className="text-gray-600">{formatCurrency(l.unitPrice)}</span> },
    { key: 'discountPct', header: 'Korting%', render: (l) => <span className="text-gray-600">{l.discountPct}%</span> },
    { key: 'vatRate', header: 'BTW%', render: (l) => <span className="text-gray-600">{l.vatRate}%</span> },
    { key: 'lineTotal', header: 'Regeltotaal', render: (l) => <span className="text-gray-900 font-medium">{formatCurrency(l.lineTotal)}</span> },
  ];

  const canBeSent = quote.status === QuoteStatus.GOEDGEKEURD || quote.status === QuoteStatus.CONCEPT;

  const logs = contactLogs || [];

  const sidebarContent = (
    <div className="space-y-8">
      <SidebarSection
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        label="Contactmomenten"
        count={logs.length}
      >
        <ContactLogsSidebar
          logs={logs}
          userCanWrite={!!userCanWrite}
          onLogOpen={() => setIsLogOpen(true)}
        />
      </SidebarSection>

      <SidebarSection
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        }
        label="Taken"
        count={incompleteTasks.length}
      >
        <QuoteTasksSidebar
          tasks={quoteTasks}
          userCanWrite={!!userCanWrite}
          onCreateTask={() => setIsTaskOpen(true)}
        />
      </SidebarSection>

      <NotesSidebarSection entityType={NoteEntityType.QUOTE} entityId={id!} />

      <DocumentsSidebarSection
        entityType={DocumentEntityType.QUOTE}
        entityId={quote.id}
        canUpload={!!userCanWrite}
      />

      <HistorySidebarSection entityType="Quote" entityId={id} />
    </div>
  );

  return (
    <DetailPageLayout iconStrip sidebar={sidebarContent}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/quotes')} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-gray-900">{quote.quoteNumber} &mdash; {quote.subject}</h2>
                <StatusBadge status={quote.status} map={QUOTE_STATUS} />
                {quote.project && (
                  <button
                    onClick={() => navigate(`/projects/${quote.project!.id}`)}
                    className="inline-flex items-center rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-700 hover:bg-primary-200"
                  >
                    {quote.project.projectNumber}
                  </button>
                )}
              </div>
            </div>
          </div>
          {userCanWrite && (
            <ActionMenu
              primaryActions={[
                ...(quote.status === QuoteStatus.CONCEPT && quote.requiresApproval ? [{
                  label: 'Ter goedkeuring',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                  onClick: handleSubmitApproval,
                  isLoading: submitApprovalMutation.isPending,
                }] : []),
                ...(quote.status === QuoteStatus.CONCEPT && !quote.requiresApproval ? [{
                  label: 'Goedkeuren',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
                  onClick: () => setIsApproveOpen(true),
                }] : []),
                ...(quote.status === QuoteStatus.TER_GOEDKEURING && userCanApprove ? [
                  {
                    label: 'Goedkeuren',
                    icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
                    onClick: () => setIsApproveOpen(true),
                  },
                  {
                    label: 'Afwijzen',
                    icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
                    onClick: () => setShowRejectInput(!showRejectInput),
                    variant: 'danger' as const,
                  },
                ] : []),
                ...(canBeSent ? [{
                  label: 'Versturen',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
                  onClick: () => setIsSendOpen(true),
                }] : []),
                ...(quote.status === QuoteStatus.VERSTUURD ? [{
                  label: 'Markeer als bekeken',
                  onClick: () => handleStatusUpdate(QuoteStatus.BEKEKEN),
                  isLoading: updateStatusMutation.isPending,
                }] : []),
                ...(quote.status === QuoteStatus.BEKEKEN ? [
                  {
                    label: 'Geaccepteerd',
                    icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
                    onClick: () => handleStatusUpdate(QuoteStatus.GEACCEPTEERD),
                    isLoading: updateStatusMutation.isPending,
                  },
                  {
                    label: 'Afgewezen',
                    icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
                    onClick: () => handleStatusUpdate(QuoteStatus.AFGEWEZEN),
                    variant: 'danger' as const,
                  },
                ] : []),
              ]}
              secondaryActions={[
                {
                  label: 'Contactmoment loggen',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                  onClick: () => setIsLogOpen(true),
                },
                {
                  label: 'Taak aanmaken',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
                  onClick: () => setIsTaskOpen(true),
                },
                ...(quote.template?.templateType === 'DOCX' ? [{
                  label: 'Voorbeeld bekijken',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
                  onClick: () => setIsPreviewOpen(true),
                }] : []),
                ...(quote.publicToken && [QuoteStatus.GOEDGEKEURD, QuoteStatus.VERSTUURD, QuoteStatus.BEKEKEN, QuoteStatus.GEACCEPTEERD].includes(quote.status as QuoteStatus) ? [{
                  label: 'PDF downloaden',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
                  onClick: async () => {
                    try {
                      const res = await fetch(`/api/v1/quotes/${id}/pdf`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` }, credentials: 'include' });
                      if (!res.ok) { showToast('PDF genereren mislukt', 'error'); return; }
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url; a.download = `Offerte-${quote.quoteNumber}.pdf`; a.click(); URL.revokeObjectURL(url);
                    } catch { showToast('PDF downloaden mislukt', 'error'); }
                  },
                }] : []),
              ]}
            />
          )}
        </div>

        {/* Reject note input */}
        {showRejectInput && (
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Reden van afwijzing</h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input placeholder="Notitie bij afwijzing (optioneel)..." value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
              </div>
              <Button variant="danger" onClick={handleReject} isLoading={rejectMutation.isPending}>Bevestig afwijzing</Button>
            </div>
          </Card>
        )}

        {/* Signing info banner */}
        {quote.status === QuoteStatus.GEACCEPTEERD && quote.signedAt && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-sm font-medium text-emerald-800">
                Digitaal ondertekend door {quote.clientName || 'klant'} op {formatDate(quote.signedAt)}
              </span>
            </div>
          </div>
        )}

        {/* Info grid */}
        <QuoteInfoCard
          quote={quote}
          canEditQuote={canEditQuote}
          updateQuoteMutation={updateQuoteMutation}
          showToast={showToast}
        />

        <CustomFieldsDisplay
          entityType={CustomFieldEntityType.QUOTE}
          customFields={quote.customFields}
        />

        {/* Financial summary */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Financieel overzicht</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotaal</span><span className="text-gray-900">{formatCurrency(quote.subtotal)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Korting</span><span className="text-gray-900">-{formatCurrency(quote.discountTotal)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">BTW</span><span className="text-gray-900">{formatCurrency(quote.vatTotal)}</span></div>
            <div className="border-t border-gray-200 pt-2 flex justify-between">
              <span className="text-sm font-semibold text-gray-900">Totaal</span>
              <span className="text-lg font-bold text-gray-900">{formatCurrency(quote.total)}</span>
            </div>
          </div>
        </Card>

        {/* Content blocks */}
        {quote.contentBlocks && (
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Inhoud</h3>
            <RichTextViewer content={quote.contentBlocks as object} />
          </Card>
        )}

        {/* Quote lines */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Offerteregels</h3>
          {(quote.lines?.length || 0) === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">Geen offerteregels</p>
          ) : (
            <Table columns={lineColumns} data={quote.lines || []} keyExtractor={(l) => l.id} emptyMessage="Geen regels" />
          )}
        </div>

        {/* Approval history */}
        {(quote.approvalRequests?.length || 0) > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Goedkeuringshistorie</h3>
            <div className="space-y-3">
              {quote.approvalRequests?.map((approval: QuoteApprovalRequest) => (
                <Card key={approval.id}>
                  <div className="flex items-start justify-between">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusConfig(APPROVAL_STATUS, approval.status).classes}`}>
                      {getStatusConfig(APPROVAL_STATUS, approval.status).label}
                    </span>
                    <span className="text-xs text-gray-400">{formatDateTimeLong(approval.requestedAt)}</span>
                  </div>
                  {approval.note && <p className="mt-2 text-sm text-gray-600">{approval.note}</p>}
                  <div className="mt-1 text-xs text-gray-400">
                    {approval.requestedByUser && <span>Aangevraagd door {approval.requestedByUser.firstName} {approval.requestedByUser.lastName}</span>}
                    {approval.reviewedByUser && <span>{' — '}Beoordeeld door {approval.reviewedByUser.firstName} {approval.reviewedByUser.lastName}{approval.reviewedAt ? ` op ${formatDateTimeLong(approval.reviewedAt)}` : ''}</span>}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Bijlagen (quote-specifieke bestanden, los van algemene documenten) */}
        <QuoteAttachmentsCard
          quoteId={id!}
          attachments={quote.attachments}
          userCanWrite={!!userCanWrite}
        />

        {/* Q&A sectie */}
        <QuoteQuestionsCard
          quoteId={id!}
          questions={quote.questions}
          userCanWrite={!!userCanWrite}
        />

        {/* Internal notes */}
        {quote.internalNotes && (
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Interne notities</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.internalNotes}</p>
          </Card>
        )}

        {/* Acties onderaan */}
        <div className="flex items-center justify-between border-t border-gray-200 pt-6">
          <p className="text-xs text-gray-400">
            Aangemaakt op {new Date(quote.createdAt).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {quote.createdByUser && ` door ${quote.createdByUser.firstName} ${quote.createdByUser.lastName}`}
          </p>
          {userCanWrite && (
            <div className="flex gap-2">
              {quote.status === QuoteStatus.CONCEPT && (
                <Button variant="secondary" size="sm" onClick={() => navigate(`/quotes/${quote.id}/edit`)}>
                  Bewerken
                </Button>
              )}
              {quote.status === QuoteStatus.CONCEPT && (
                <Button variant="danger" size="sm" onClick={handleDelete}>Offerte verwijderen</Button>
              )}
            </div>
          )}
        </div>

        {/* Modals */}
        {quote && (
          <>
            <CreateTaskModal isOpen={isTaskOpen} onClose={() => setIsTaskOpen(false)} entityType={TaskEntityType.QUOTE} entityId={quote.id} />
            <AddLogModal isOpen={isLogOpen} onClose={() => setIsLogOpen(false)} contactId={quote.contactId} />
          </>
        )}
        {quote && isSendOpen && (
          <SendQuoteModal isOpen={isSendOpen} onClose={() => setIsSendOpen(false)} quote={quote} />
        )}
        {quote && isApproveOpen && (
          <ApproveQuoteModal
            quoteId={quote.id}
            quoteNumber={quote.quoteNumber}
            isOpen={isApproveOpen}
            onClose={() => setIsApproveOpen(false)}
          />
        )}
        {quote && isPreviewOpen && (
          <PdfPreviewModal
            isOpen={isPreviewOpen}
            onClose={() => setIsPreviewOpen(false)}
            quoteId={quote.id}
            quoteNumber={quote.quoteNumber}
          />
        )}
      </div>
    </DetailPageLayout>
  );
}

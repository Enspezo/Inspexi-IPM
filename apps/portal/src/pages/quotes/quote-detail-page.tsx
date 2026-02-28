import { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  QuoteStatus,
  ApprovalStatus,
  Role,
  TaskEntityType,
  DocumentEntityType,
} from '@/types';
import { Button, Card, Spinner, Input, Table, useToast, type Column } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { useAuth } from '@/providers/auth-provider';
import {
  useQuote,
  useSubmitApproval,
  useRejectQuote,
  useUpdateQuoteStatus,
  useDeleteQuote,
  useAddQuestion,
  useAnswerQuestion,
  useUploadQuoteAttachment,
  useDeleteQuoteAttachment,
} from './hooks/use-quotes';
import type { QuoteLine, QuoteApprovalRequest, QuoteQuestion, QuoteAttachment } from '@/types';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { CreateTaskModal } from '@/pages/tasks/components/create-task-modal';
import { DocumentsSection } from '@/components/documents';
import { SendQuoteModal } from './components/send-quote-modal';
import { ApproveQuoteModal } from './components/approve-quote-modal';
import { RichTextViewer } from '@/components/ui';
import { getAccessToken } from '@/lib/api-client';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];
const canApprove = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER];

const statusColors: Record<string, string> = {
  [QuoteStatus.CONCEPT]: 'bg-gray-100 text-gray-800',
  [QuoteStatus.TER_GOEDKEURING]: 'bg-yellow-100 text-yellow-800',
  [QuoteStatus.GOEDGEKEURD]: 'bg-green-100 text-green-800',
  [QuoteStatus.VERSTUURD]: 'bg-blue-100 text-blue-800',
  [QuoteStatus.BEKEKEN]: 'bg-purple-100 text-purple-800',
  [QuoteStatus.GEACCEPTEERD]: 'bg-emerald-100 text-emerald-800',
  [QuoteStatus.AFGEWEZEN]: 'bg-red-100 text-red-800',
  [QuoteStatus.VERLOPEN]: 'bg-orange-100 text-orange-800',
};

const statusLabels: Record<string, string> = {
  [QuoteStatus.CONCEPT]: 'Concept',
  [QuoteStatus.TER_GOEDKEURING]: 'Ter goedkeuring',
  [QuoteStatus.GOEDGEKEURD]: 'Goedgekeurd',
  [QuoteStatus.VERSTUURD]: 'Verstuurd',
  [QuoteStatus.BEKEKEN]: 'Bekeken',
  [QuoteStatus.GEACCEPTEERD]: 'Geaccepteerd',
  [QuoteStatus.AFGEWEZEN]: 'Afgewezen',
  [QuoteStatus.VERLOPEN]: 'Verlopen',
};

const approvalStatusLabels: Record<string, string> = {
  [ApprovalStatus.PENDING]: 'In afwachting',
  [ApprovalStatus.APPROVED]: 'Goedgekeurd',
  [ApprovalStatus.REJECTED]: 'Afgewezen',
};

const approvalStatusColors: Record<string, string> = {
  [ApprovalStatus.PENDING]: 'bg-yellow-100 text-yellow-800',
  [ApprovalStatus.APPROVED]: 'bg-green-100 text-green-800',
  [ApprovalStatus.REJECTED]: 'bg-red-100 text-red-800',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getContactName(contact?: { companyName?: string | null; firstName?: string | null; lastName?: string | null }): string {
  if (!contact) return '—';
  if (contact.companyName) return contact.companyName;
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: quote, isLoading, error } = useQuote(id!);
  const submitApprovalMutation = useSubmitApproval(id!);
  const rejectMutation = useRejectQuote(id!);
  const updateStatusMutation = useUpdateQuoteStatus(id!);
  const deleteMutation = useDeleteQuote();
  const addQuestionMutation = useAddQuestion(id!);
  const uploadAttachmentMutation = useUploadQuoteAttachment(id!);
  const deleteAttachmentMutation = useDeleteQuoteAttachment(id!);

  const [rejectNote, setRejectNote] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const answerMutation = useAnswerQuestion(id!, answeringId ?? '');

  const userCanWrite = user && user.roles.some(r => canWrite.includes(r));
  const userCanApprove = user && user.roles.some(r => canApprove.includes(r));

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
    if (!window.confirm('Weet u zeker dat u deze offerte wilt verwijderen?')) return;
    try {
      await deleteMutation.mutateAsync(quote.id);
      showToast('Offerte verwijderd', 'success');
      navigate('/quotes');
    } catch { showToast('Verwijderen mislukt', 'error'); }
  };

  const handleAddQuestion = async () => {
    if (!newQuestion.trim()) return;
    try {
      await addQuestionMutation.mutateAsync({ message: newQuestion });
      setNewQuestion('');
      showToast('Bericht toegevoegd', 'success');
    } catch { showToast('Toevoegen mislukt', 'error'); }
  };

  const handleAnswer = async () => {
    if (!answerText.trim() || !answeringId) return;
    try {
      await answerMutation.mutateAsync({ message: answerText });
      setAnswerText('');
      setAnsweringId(null);
      showToast('Antwoord verstuurd', 'success');
    } catch { showToast('Versturen mislukt', 'error'); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadAttachmentMutation.mutateAsync(file);
      showToast('Bijlage geüpload', 'success');
    } catch { showToast('Uploaden mislukt', 'error'); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!window.confirm('Bijlage verwijderen?')) return;
    try {
      await deleteAttachmentMutation.mutateAsync(attachmentId);
      showToast('Bijlage verwijderd', 'success');
    } catch { showToast('Verwijderen mislukt', 'error'); }
  };

  const handleDownloadAttachment = async (attachment: QuoteAttachment) => {
    try {
      const response = await fetch(`/api/v1/quotes/${id}/attachments/${attachment.id}/download`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken') ?? ''}` },
        credentials: 'include',
      });
      // Use apiClient approach: fetch with auth
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch { showToast('Downloaden mislukt', 'error'); }
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  }

  if (error || !quote) {
    return <div className="rounded-lg bg-danger-50 p-4 text-sm text-danger-600">{error?.message || 'Offerte niet gevonden'}</div>;
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

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="Quote" entityId={id} />}>
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
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[quote.status] || 'bg-gray-100 text-gray-600'}`}>
                  {statusLabels[quote.status] || quote.status}
                </span>
              </div>
            </div>
          </div>
          {userCanWrite && (
            <div className="flex flex-wrap gap-2">
              {/* Approval flow */}
              {quote.status === QuoteStatus.CONCEPT && quote.requiresApproval && (
                <Button size="sm" onClick={handleSubmitApproval} isLoading={submitApprovalMutation.isPending}>Ter goedkeuring</Button>
              )}
              {quote.status === QuoteStatus.CONCEPT && !quote.requiresApproval && (
                <Button size="sm" onClick={() => setIsApproveOpen(true)}>Goedkeuren</Button>
              )}
              {quote.status === QuoteStatus.TER_GOEDKEURING && userCanApprove && (
                <>
                  <Button size="sm" onClick={() => setIsApproveOpen(true)}>Goedkeuren</Button>
                  <Button variant="danger" size="sm" onClick={() => setShowRejectInput(!showRejectInput)}>Afwijzen</Button>
                </>
              )}
              {/* Send button */}
              {canBeSent && (
                <Button size="sm" onClick={() => setIsSendOpen(true)}>
                  <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  Versturen
                </Button>
              )}
              {/* Status updates for sent quotes */}
              {quote.status === QuoteStatus.VERSTUURD && (
                <Button size="sm" variant="secondary" onClick={() => handleStatusUpdate(QuoteStatus.BEKEKEN)} isLoading={updateStatusMutation.isPending}>Markeer als bekeken</Button>
              )}
              {quote.status === QuoteStatus.BEKEKEN && (
                <>
                  <Button size="sm" onClick={() => handleStatusUpdate(QuoteStatus.GEACCEPTEERD)} isLoading={updateStatusMutation.isPending}>Geaccepteerd</Button>
                  <Button variant="danger" size="sm" onClick={() => handleStatusUpdate(QuoteStatus.AFGEWEZEN)}>Afgewezen</Button>
                </>
              )}
              {/* Utilities */}
              <Button variant="secondary" size="sm" onClick={() => setIsTaskOpen(true)}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                Taak
              </Button>
              {quote.publicToken && [QuoteStatus.GOEDGEKEURD, QuoteStatus.VERSTUURD, QuoteStatus.BEKEKEN, QuoteStatus.GEACCEPTEERD].includes(quote.status as QuoteStatus) && (
                <Button variant="secondary" size="sm" onClick={async () => {
                  try {
                    const res = await fetch(`/api/v1/quotes/${id}/pdf`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` }, credentials: 'include' });
                    if (!res.ok) { showToast('PDF genereren mislukt', 'error'); return; }
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = `Offerte-${quote.quoteNumber}.pdf`; a.click(); URL.revokeObjectURL(url);
                  } catch { showToast('PDF downloaden mislukt', 'error'); }
                }}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  PDF
                </Button>
              )}
              {quote.status === QuoteStatus.CONCEPT && (
                <Button variant="secondary" size="sm" onClick={() => navigate(`/quotes/${quote.id}/edit`)}>Bewerken</Button>
              )}
            </div>
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
                Digitaal ondertekend door {quote.clientName || 'klant'} op {formatDateShort(quote.signedAt)}
              </span>
            </div>
          </div>
        )}

        {/* Info grid */}
        <Card>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Relatie</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {quote.contact ? (
                  <Link to={`/contacts/${quote.contactId}`} className="text-primary-600 hover:text-primary-800 hover:underline">
                    {getContactName(quote.contact)}
                  </Link>
                ) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Locatie</dt>
              <dd className="mt-1 text-sm text-gray-900">{quote.location ? `${quote.location.name} — ${quote.location.city}` : '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Aanvraag</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {quote.request ? (
                  <Link to={`/requests/${quote.requestId}`} className="text-primary-600 hover:text-primary-800 hover:underline">{quote.request.title}</Link>
                ) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Template</dt>
              <dd className="mt-1 text-sm text-gray-900">{quote.template ? quote.template.name : '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Geldig tot</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Aangemaakt door</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {quote.createdByUser ? `${quote.createdByUser.firstName} ${quote.createdByUser.lastName}` : '—'}
              </dd>
            </div>
            {quote.sentAt && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Verstuurd op</dt>
                <dd className="mt-1 text-sm text-gray-900">{formatDateShort(quote.sentAt)}</dd>
              </div>
            )}
            {quote.viewedAt && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Geopend op</dt>
                <dd className="mt-1 text-sm text-gray-900">{formatDateShort(quote.viewedAt)}</dd>
              </div>
            )}
            {quote.publicToken && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Publieke link</dt>
                <dd className="mt-1 text-sm">
                  <a
                    href={`/offerte/${quote.publicToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-800 hover:underline text-xs"
                  >
                    Klantportaal bekijken →
                  </a>
                </dd>
              </div>
            )}
          </div>
        </Card>

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
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${approvalStatusColors[approval.status] || 'bg-gray-100 text-gray-600'}`}>
                      {approvalStatusLabels[approval.status] || approval.status}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(approval.requestedAt)}</span>
                  </div>
                  {approval.note && <p className="mt-2 text-sm text-gray-600">{approval.note}</p>}
                  <div className="mt-1 text-xs text-gray-400">
                    {approval.requestedByUser && <span>Aangevraagd door {approval.requestedByUser.firstName} {approval.requestedByUser.lastName}</span>}
                    {approval.reviewedByUser && <span>{' — '}Beoordeeld door {approval.reviewedByUser.firstName} {approval.reviewedByUser.lastName}{approval.reviewedAt ? ` op ${formatDate(approval.reviewedAt)}` : ''}</span>}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Bijlagen (quote-specifieke bestanden, los van algemene documenten) */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Bijlagen bij offerte</h3>
            {userCanWrite && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  isLoading={uploadAttachmentMutation.isPending}
                >
                  <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                  Bijlage uploaden
                </Button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv,.zip" />
              </>
            )}
          </div>
          {(quote.attachments?.length || 0) === 0 ? (
            <p className="text-sm text-gray-500">Geen bijlagen</p>
          ) : (
            <div className="space-y-2">
              {quote.attachments?.map((att: QuoteAttachment) => (
                <div key={att.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="h-4 w-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    <span className="truncate text-sm text-gray-900">{att.fileName}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatFileSize(att.fileSize)}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => handleDownloadAttachment(att)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Downloaden">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </button>
                    {userCanWrite && (
                      <button onClick={() => handleDeleteAttachment(att.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Q&A sectie */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Vragen & Antwoorden</h3>
          {(quote.questions?.length || 0) === 0 ? (
            <p className="text-sm text-gray-500 mb-4">Nog geen vragen</p>
          ) : (
            <div className="space-y-3 mb-4">
              {quote.questions?.map((q: QuoteQuestion) => (
                <div
                  key={q.id}
                  className={`rounded-lg p-3 ${q.isFromClient ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-100'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${q.isFromClient ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'}`}>
                        {q.isFromClient ? 'Klant' : (q.user ? `${q.user.firstName} ${q.user.lastName}` : 'Medewerker')}
                      </span>
                      <span className="text-xs text-gray-400">{formatDate(q.createdAt)}</span>
                    </div>
                    {userCanWrite && q.isFromClient && answeringId !== q.id && (
                      <button onClick={() => { setAnsweringId(q.id); setAnswerText(''); }} className="text-xs text-primary-600 hover:text-primary-800">
                        Beantwoorden
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{q.message}</p>
                  {answeringId === q.id && (
                    <div className="mt-3 flex gap-2">
                      <textarea
                        className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
                        rows={3}
                        placeholder="Uw antwoord..."
                        value={answerText}
                        onChange={(e) => setAnswerText(e.target.value)}
                      />
                      <div className="flex flex-col gap-1">
                        <Button size="sm" onClick={handleAnswer} isLoading={answerMutation.isPending} disabled={!answerText.trim()}>Sturen</Button>
                        <Button size="sm" variant="secondary" onClick={() => setAnsweringId(null)}>Annuleer</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {/* Medewerker toevoegt een bericht */}
          {userCanWrite && (
            <div className="flex gap-2 border-t border-gray-100 pt-4">
              <textarea
                className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
                rows={2}
                placeholder="Voeg een opmerking of vraag toe..."
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
              />
              <Button size="sm" onClick={handleAddQuestion} isLoading={addQuestionMutation.isPending} disabled={!newQuestion.trim()}>
                Toevoegen
              </Button>
            </div>
          )}
        </Card>

        {/* Internal notes */}
        {quote.internalNotes && (
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Interne notities</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.internalNotes}</p>
          </Card>
        )}

        {/* Algemene documenten (via documenten module) */}
        <Card>
          <DocumentsSection entityType={DocumentEntityType.QUOTE} entityId={quote.id} canUpload={!!userCanWrite} />
        </Card>

        {/* Verwijderen */}
        {userCanWrite && quote.status === QuoteStatus.CONCEPT && (
          <div className="flex justify-end border-t border-gray-200 pt-6">
            <Button variant="danger" size="sm" onClick={handleDelete}>Offerte verwijderen</Button>
          </div>
        )}

        {/* Modals */}
        {quote && (
          <CreateTaskModal isOpen={isTaskOpen} onClose={() => setIsTaskOpen(false)} entityType={TaskEntityType.QUOTE} entityId={quote.id} />
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
      </div>
    </DetailPageLayout>
  );
}

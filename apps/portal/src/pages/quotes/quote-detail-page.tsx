import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  QuoteStatus,
  ApprovalStatus,
  Role,
} from '@/types';
import { Button, Card, Spinner, Input, Table, useToast, type Column } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import {
  useQuote,
  useSubmitApproval,
  useApproveQuote,
  useRejectQuote,
  useUpdateQuoteStatus,
  useDeleteQuote,
} from './hooks/use-quotes';
import type { QuoteLine, QuoteApprovalRequest } from '@/types';

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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

function getContactName(contact?: { companyName?: string | null; firstName?: string | null; lastName?: string | null }): string {
  if (!contact) return '\u2014';
  if (contact.companyName) return contact.companyName;
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '\u2014';
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: quote, isLoading, error } = useQuote(id!);
  const submitApprovalMutation = useSubmitApproval(id!);
  const approveMutation = useApproveQuote(id!);
  const rejectMutation = useRejectQuote(id!);
  const updateStatusMutation = useUpdateQuoteStatus(id!);
  const deleteMutation = useDeleteQuote();

  const [rejectNote, setRejectNote] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const userCanWrite = user && canWrite.includes(user.role);
  const userCanApprove = user && canApprove.includes(user.role);

  const handleSubmitApproval = async () => {
    try {
      await submitApprovalMutation.mutateAsync();
      showToast('Offerte ter goedkeuring ingediend', 'success');
    } catch {
      showToast('Indienen mislukt', 'error');
    }
  };

  const handleApprove = async () => {
    try {
      await approveMutation.mutateAsync();
      showToast('Offerte goedgekeurd', 'success');
    } catch {
      showToast('Goedkeuren mislukt', 'error');
    }
  };

  const handleReject = async () => {
    try {
      await rejectMutation.mutateAsync({ note: rejectNote || undefined });
      showToast('Offerte afgewezen', 'success');
      setRejectNote('');
      setShowRejectInput(false);
    } catch {
      showToast('Afwijzen mislukt', 'error');
    }
  };

  const handleStatusUpdate = async (status: string) => {
    try {
      await updateStatusMutation.mutateAsync({ status });
      showToast('Status bijgewerkt', 'success');
    } catch {
      showToast('Status wijzigen mislukt', 'error');
    }
  };

  const handleDelete = async () => {
    if (!quote) return;
    if (!window.confirm('Weet u zeker dat u deze offerte wilt verwijderen?')) return;
    try {
      await deleteMutation.mutateAsync(quote.id);
      showToast('Offerte verwijderd', 'success');
      navigate('/quotes');
    } catch {
      showToast('Verwijderen mislukt', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="rounded-lg bg-danger-50 p-4 text-sm text-danger-600">
        {error?.message || 'Offerte niet gevonden'}
      </div>
    );
  }

  const lineColumns: Column<QuoteLine>[] = [
    {
      key: 'description',
      header: 'Omschrijving',
      render: (line) => <span className="text-gray-900">{line.description}</span>,
    },
    {
      key: 'quantity',
      header: 'Aantal',
      render: (line) => <span className="text-gray-600">{line.quantity}</span>,
    },
    {
      key: 'unit',
      header: 'Eenheid',
      render: (line) => <span className="text-gray-600">{line.unit}</span>,
    },
    {
      key: 'unitPrice',
      header: 'Eenheidsprijs',
      render: (line) => <span className="text-gray-600">{formatCurrency(line.unitPrice)}</span>,
    },
    {
      key: 'discountPct',
      header: 'Korting%',
      render: (line) => <span className="text-gray-600">{line.discountPct}%</span>,
    },
    {
      key: 'vatRate',
      header: 'BTW%',
      render: (line) => <span className="text-gray-600">{line.vatRate}%</span>,
    },
    {
      key: 'lineTotal',
      header: 'Regeltotaal',
      render: (line) => <span className="text-gray-900 font-medium">{formatCurrency(line.lineTotal)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/quotes')}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">
                {quote.quoteNumber} &mdash; {quote.subject}
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  statusColors[quote.status] || 'bg-gray-100 text-gray-600'
                }`}
              >
                {statusLabels[quote.status] || quote.status}
              </span>
            </div>
          </div>
        </div>
        {userCanWrite && (
          <div className="flex gap-2">
            {/* Status-specific action buttons */}
            {quote.status === QuoteStatus.CONCEPT && quote.requiresApproval && (
              <Button
                size="sm"
                onClick={handleSubmitApproval}
                isLoading={submitApprovalMutation.isPending}
              >
                Ter goedkeuring
              </Button>
            )}
            {quote.status === QuoteStatus.CONCEPT && !quote.requiresApproval && (
              <Button
                size="sm"
                onClick={handleApprove}
                isLoading={approveMutation.isPending}
              >
                Goedkeuren
              </Button>
            )}
            {quote.status === QuoteStatus.TER_GOEDKEURING && userCanApprove && (
              <>
                <Button
                  size="sm"
                  onClick={handleApprove}
                  isLoading={approveMutation.isPending}
                >
                  Goedkeuren
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowRejectInput(!showRejectInput)}
                >
                  Afwijzen
                </Button>
              </>
            )}
            {quote.status === QuoteStatus.GOEDGEKEURD && (
              <Button
                size="sm"
                onClick={() => handleStatusUpdate(QuoteStatus.VERSTUURD)}
                isLoading={updateStatusMutation.isPending}
              >
                Markeer als verstuurd
              </Button>
            )}
            {quote.status === QuoteStatus.VERSTUURD && (
              <Button
                size="sm"
                onClick={() => handleStatusUpdate(QuoteStatus.BEKEKEN)}
                isLoading={updateStatusMutation.isPending}
              >
                Markeer als bekeken
              </Button>
            )}
            {quote.status === QuoteStatus.BEKEKEN && (
              <>
                <Button
                  size="sm"
                  onClick={() => handleStatusUpdate(QuoteStatus.GEACCEPTEERD)}
                  isLoading={updateStatusMutation.isPending}
                >
                  Geaccepteerd
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleStatusUpdate(QuoteStatus.AFGEWEZEN)}
                >
                  Afgewezen
                </Button>
              </>
            )}
            {quote.status === QuoteStatus.CONCEPT && (
              <>
                <Button variant="secondary" size="sm" onClick={() => navigate(`/quotes/${quote.id}/edit`)}>
                  Bewerken
                </Button>
                <Button variant="danger" size="sm" onClick={handleDelete}>
                  Verwijderen
                </Button>
              </>
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
              <Input
                placeholder="Notitie bij afwijzing (optioneel)..."
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
              />
            </div>
            <Button
              variant="danger"
              onClick={handleReject}
              isLoading={rejectMutation.isPending}
            >
              Bevestig afwijzing
            </Button>
          </div>
        </Card>
      )}

      {/* Info grid */}
      <Card>
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
          <div>
            <dt className="text-sm font-medium text-gray-500">Relatie</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {quote.contact ? (
                <Link
                  to={`/contacts/${quote.contactId}`}
                  className="text-primary-600 hover:text-primary-800 hover:underline"
                >
                  {getContactName(quote.contact)}
                </Link>
              ) : (
                '\u2014'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Locatie</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {quote.location
                ? `${quote.location.name} \u2014 ${quote.location.city}`
                : '\u2014'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Aanvraag</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {quote.request ? (
                <Link
                  to={`/requests/${quote.requestId}`}
                  className="text-primary-600 hover:text-primary-800 hover:underline"
                >
                  {quote.request.title}
                </Link>
              ) : (
                '\u2014'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Template</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {quote.template ? quote.template.name : '\u2014'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Geldig tot</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {quote.validUntil
                ? new Date(quote.validUntil).toLocaleDateString('nl-NL', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : '\u2014'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Aangemaakt door</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {quote.createdByUser
                ? `${quote.createdByUser.firstName} ${quote.createdByUser.lastName}`
                : '\u2014'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Aangemaakt op</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {formatDate(quote.createdAt)}
            </dd>
          </div>
        </div>
      </Card>

      {/* Financial summary */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Financieel overzicht</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Subtotaal</span>
            <span className="text-gray-900">{formatCurrency(quote.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Korting</span>
            <span className="text-gray-900">-{formatCurrency(quote.discountTotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">BTW</span>
            <span className="text-gray-900">{formatCurrency(quote.vatTotal)}</span>
          </div>
          <div className="border-t border-gray-200 pt-2 flex justify-between">
            <span className="text-sm font-semibold text-gray-900">Totaal</span>
            <span className="text-lg font-bold text-gray-900">{formatCurrency(quote.total)}</span>
          </div>
        </div>
      </Card>

      {/* Quote lines */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Offerteregels</h3>
        {(quote.lines?.length || 0) === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">
            Geen offerteregels
          </p>
        ) : (
          <Table
            columns={lineColumns}
            data={quote.lines || []}
            keyExtractor={(l) => l.id}
            emptyMessage="Geen regels"
          />
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
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        approvalStatusColors[approval.status] || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {approvalStatusLabels[approval.status] || approval.status}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatDate(approval.requestedAt)}
                  </span>
                </div>
                {approval.note && (
                  <p className="mt-2 text-sm text-gray-600">{approval.note}</p>
                )}
                <div className="mt-1 text-xs text-gray-400">
                  {approval.requestedByUser && (
                    <span>
                      Aangevraagd door {approval.requestedByUser.firstName} {approval.requestedByUser.lastName}
                    </span>
                  )}
                  {approval.reviewedByUser && (
                    <span>
                      {' \u2014 '}Beoordeeld door {approval.reviewedByUser.firstName} {approval.reviewedByUser.lastName}
                      {approval.reviewedAt ? ` op ${formatDate(approval.reviewedAt)}` : ''}
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Internal notes */}
      {quote.internalNotes && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Interne notities</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.internalNotes}</p>
        </Card>
      )}
    </div>
  );
}

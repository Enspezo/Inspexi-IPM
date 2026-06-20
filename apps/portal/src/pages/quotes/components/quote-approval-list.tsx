import { Card, Button, useToast, useConfirm } from '@/components/ui';
import { APPROVAL_STATUS, getStatusConfig } from '@/lib/status';
import { getErrorMessage } from '@/lib/api-client';
import { ApprovalKind, ApprovalStatus, Role } from '@/types';
import type { QuoteApprovalRequest, User } from '@/types';
import { formatDateTimeLong } from './quote-detail-helpers';
import { useReviewVoluntaryApproval, useCancelVoluntaryApproval } from '../hooks/use-quotes';

const ROLE_LABELS: Record<string, string> = {
  [Role.SUPERUSER]: 'Superuser',
  [Role.ORG_ADMIN]: 'Org Admin',
  [Role.MANAGER]: 'Manager',
  [Role.BACKOFFICE]: 'Backoffice',
  [Role.WERKVOORBEREIDER]: 'Werkvoorbereider',
  [Role.INSPECTEUR]: 'Inspecteur',
};

const MANDATORY_FALLBACK_ROLES = [Role.MANAGER, Role.ORG_ADMIN];

/** Beschrijft soort + doel van een goedkeuringsverzoek. */
function describeTarget(a: QuoteApprovalRequest): string {
  switch (a.kind) {
    case ApprovalKind.THRESHOLD:
      return a.approverRole
        ? `Verplichte goedkeuring — rol: ${ROLE_LABELS[a.approverRole] ?? a.approverRole}`
        : 'Verplichte goedkeuring';
    case ApprovalKind.VOLUNTARY_TEAM:
      return `Vrijwillig — team: ${a.approverRole ? ROLE_LABELS[a.approverRole] ?? a.approverRole : '—'}`;
    case ApprovalKind.VOLUNTARY_PERSON:
      return `Vrijwillig — persoon: ${
        a.approverUser ? `${a.approverUser.firstName} ${a.approverUser.lastName}` : '—'
      }`;
    default:
      return '';
  }
}

/** Of de huidige gebruiker de doelgroep van een rol-gericht verzoek is. */
function userMatchesRole(user: User | null, a: QuoteApprovalRequest): boolean {
  if (!user) return false;
  if (user.roles.includes(Role.SUPERUSER)) return true;
  const target = a.approverRole ? [a.approverRole] : MANDATORY_FALLBACK_ROLES;
  return user.roles.some((r) => target.includes(r));
}

interface Props {
  quoteId: string;
  approvals: QuoteApprovalRequest[];
  user: User | null;
}

export function QuoteApprovalList({ quoteId, approvals, user }: Props) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const reviewMutation = useReviewVoluntaryApproval(quoteId);
  const cancelMutation = useCancelVoluntaryApproval(quoteId);

  if (!approvals.length) return null;

  const handleReview = async (requestId: string, approved: boolean) => {
    try {
      await reviewMutation.mutateAsync({ requestId, approved });
      showToast(approved ? 'Verzoek goedgekeurd' : 'Verzoek afgewezen', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Beoordelen mislukt'), 'error');
    }
  };

  const handleCancel = async (requestId: string) => {
    const ok = await confirm({
      title: 'Verzoek intrekken',
      message: 'Weet u zeker dat u dit goedkeuringsverzoek wilt intrekken?',
      confirmLabel: 'Intrekken',
    });
    if (!ok) return;
    try {
      await cancelMutation.mutateAsync(requestId);
      showToast('Verzoek ingetrokken', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Intrekken mislukt'), 'error');
    }
  };

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Goedkeuringsverzoeken</h3>
      <div className="space-y-3">
        {approvals.map((a) => {
          const isVoluntary =
            a.kind === ApprovalKind.VOLUNTARY_TEAM || a.kind === ApprovalKind.VOLUNTARY_PERSON;
          const isPending = a.status === ApprovalStatus.PENDING;
          const isRequester = !!user && a.requestedBy === user.id;
          const isTarget =
            a.kind === ApprovalKind.VOLUNTARY_PERSON
              ? !!user && a.approverUserId === user.id
              : userMatchesRole(user, a);
          const cfg = getStatusConfig(APPROVAL_STATUS, a.status);

          return (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.classes}`}>
                    {cfg.label}
                  </span>
                  <p className="mt-1 text-sm font-medium text-gray-900">{describeTarget(a)}</p>
                </div>
                <span className="shrink-0 text-xs text-gray-400">{formatDateTimeLong(a.requestedAt)}</span>
              </div>
              {a.note && <p className="mt-2 text-sm text-gray-600">{a.note}</p>}
              <div className="mt-1 text-xs text-gray-400">
                {a.requestedByUser && (
                  <span>
                    Aangevraagd door {a.requestedByUser.firstName} {a.requestedByUser.lastName}
                  </span>
                )}
                {a.reviewedByUser && (
                  <span>
                    {' — '}Beoordeeld door {a.reviewedByUser.firstName} {a.reviewedByUser.lastName}
                    {a.reviewedAt ? ` op ${formatDateTimeLong(a.reviewedAt)}` : ''}
                  </span>
                )}
              </div>

              {/* Acties voor vrijwillige verzoeken */}
              {isVoluntary && isPending && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {isTarget && (
                    <>
                      <Button size="sm" onClick={() => handleReview(a.id, true)} isLoading={reviewMutation.isPending}>
                        Goedkeuren
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleReview(a.id, false)} isLoading={reviewMutation.isPending}>
                        Afwijzen
                      </Button>
                    </>
                  )}
                  {isRequester && (
                    <Button size="sm" variant="secondary" onClick={() => handleCancel(a.id)} isLoading={cancelMutation.isPending}>
                      Intrekken
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

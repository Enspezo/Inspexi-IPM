import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { Card, Button, Select, Checkbox, StatusBadge, Spinner, ErrorBox } from '@/components/ui';
import { SUPPORT_TICKET_STATUS, SUPPORT_TICKET_PRIORITY } from '@/lib/status';
import { formatDateTime } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import { ADMIN_ROLES } from '@/lib/roles';
import { Role, SupportTicketStatus, SupportTicketPriority } from '@/types';
import {
  useSupportTicket,
  useAddTicketMessage,
  useUpdateTicket,
} from '../hooks/use-support-tickets';

const STATUS_OPTIONS = Object.entries(SUPPORT_TICKET_STATUS).map(([value, cfg]) => ({
  value,
  label: cfg.label,
}));
const PRIORITY_OPTIONS = Object.entries(SUPPORT_TICKET_PRIORITY).map(([value, cfg]) => ({
  value,
  label: cfg.label,
}));

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: ticket, isLoading, error } = useSupportTicket(id!);
  const addMessage = useAddTicketMessage(id!);
  const update = useUpdateTicket(id!);
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);

  if (isLoading) return <Spinner size="lg" />;
  if (error || !ticket) return <ErrorBox>Ticket niet gevonden.</ErrorBox>;

  const canEdit = !!user?.roles?.some((r) => ADMIN_ROLES.includes(r));
  const isSupport = !!user?.roles?.includes(Role.SUPERUSER);

  async function sendReply() {
    if (!reply.trim()) return;
    await addMessage.mutateAsync({ body: reply, isInternal: isSupport ? internal : undefined });
    setReply('');
    setInternal(false);
  }

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="SupportTicket" entityId={id} />}>
      <div className="space-y-6">
        <Link to="/help/tickets" className="text-sm text-gray-500 hover:underline">
          ← Terug naar tickets
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900">
            #{ticket.ticketNumber} — {ticket.subject}
          </h1>
          <div className="flex gap-2">
            <StatusBadge map={SUPPORT_TICKET_STATUS} status={ticket.status} />
            <StatusBadge map={SUPPORT_TICKET_PRIORITY} status={ticket.priority} />
          </div>
        </div>

        {ticket.contextModule && (
          <p className="text-xs text-gray-500">
            Aangemaakt vanuit module: <span className="font-medium">{ticket.contextModule}</span>
          </p>
        )}

        {canEdit && (
          <Card>
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-48">
                <Select
                  label="Status"
                  value={ticket.status}
                  options={STATUS_OPTIONS}
                  onChange={(e) =>
                    update.mutate({ status: e.target.value as SupportTicketStatus })
                  }
                />
              </div>
              <div className="w-48">
                <Select
                  label="Prioriteit"
                  value={ticket.priority}
                  options={PRIORITY_OPTIONS}
                  onChange={(e) =>
                    update.mutate({ priority: e.target.value as SupportTicketPriority })
                  }
                />
              </div>
            </div>
          </Card>
        )}

        {/* Berichten-thread */}
        <div className="space-y-3">
          {ticket.messages?.map((m) => (
            <Card
              key={m.id}
              className={m.authorType === 'SUPPORT' ? 'border-l-4 border-primary-400' : ''}
            >
              <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                <span>
                  {m.author ? `${m.author.firstName} ${m.author.lastName}` : 'Systeem'}
                  {' · '}
                  {m.authorType === 'SUPPORT' ? 'Support' : 'Klant'}
                  {m.isInternal && (
                    <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
                      intern
                    </span>
                  )}
                </span>
                <span>{formatDateTime(m.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{m.body}</p>
            </Card>
          ))}
        </div>

        {/* Reactie */}
        <Card>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            placeholder="Typ een reactie…"
            className="w-full rounded-lg border border-gray-300 p-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
          <div className="mt-2 flex items-center justify-between">
            {isSupport ? (
              <Checkbox
                label="Interne notitie (niet zichtbaar voor klant)"
                checked={internal}
                onChange={(e) => setInternal(e.target.checked)}
              />
            ) : (
              <span />
            )}
            <Button isLoading={addMessage.isPending} onClick={sendReply} disabled={!reply.trim()}>
              Reactie versturen
            </Button>
          </div>
        </Card>
      </div>
    </DetailPageLayout>
  );
}

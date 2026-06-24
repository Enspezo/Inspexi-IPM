import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/page-header';
import { Card, Button, StatusBadge, Spinner, ErrorBox, Tabs } from '@/components/ui';
import { SUPPORT_TICKET_STATUS, SUPPORT_TICKET_PRIORITY } from '@/lib/status';
import { formatDateTime } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import { MANAGEMENT_ROLES } from '@/lib/roles';
import { useSupportTickets } from '../hooks/use-support-tickets';

type Scope = 'mine' | 'org';

export default function TicketsPage() {
  const { user } = useAuth();
  const canSeeOrg = !!user?.roles?.some((r) => MANAGEMENT_ROLES.includes(r));
  const [tab, setTab] = useState<Scope>('mine');
  const scope: Scope = canSeeOrg ? tab : 'mine';
  const { data, isLoading, error } = useSupportTickets({ scope, limit: 50 });

  const tabs = canSeeOrg
    ? [
        { key: 'mine' as const, label: 'Mijn tickets' },
        { key: 'org' as const, label: 'Organisatie' },
      ]
    : [{ key: 'mine' as const, label: 'Mijn tickets' }];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        description="Je tickets en de status ervan."
        actions={
          <Link to="/help/tickets/new">
            <Button>Nieuw ticket</Button>
          </Link>
        }
      />

      <Tabs tabs={tabs} active={scope} onChange={(k) => setTab(k as Scope)} />

      {isLoading && <Spinner size="lg" />}
      {error && <ErrorBox>Kon tickets niet laden.</ErrorBox>}

      {data && (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-4 font-medium">#</th>
                <th className="py-2 pr-4 font-medium">Onderwerp</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Prioriteit</th>
                <th className="py-2 font-medium">Laatste activiteit</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 pr-4 text-gray-500">#{t.ticketNumber}</td>
                  <td className="py-2 pr-4">
                    <Link
                      to={`/help/tickets/${t.id}`}
                      className="font-medium text-primary-600 hover:underline"
                    >
                      {t.subject}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge map={SUPPORT_TICKET_STATUS} status={t.status} />
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge map={SUPPORT_TICKET_PRIORITY} status={t.priority} />
                  </td>
                  <td className="py-2 text-gray-500">{formatDateTime(t.lastMessageAt)}</td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">
                    Geen tickets.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

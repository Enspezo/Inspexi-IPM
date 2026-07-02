import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/page-header';
import {
  Button,
  StatusBadge,
  Spinner,
  ErrorBox,
  Tabs,
  Select,
  Table,
  type Column,
} from '@/components/ui';
import { SUPPORT_TICKET_STATUS, SUPPORT_TICKET_PRIORITY } from '@/lib/status';
import { formatDateTime } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import { MANAGEMENT_ROLES } from '@/lib/roles';
import { hasRole } from '@/lib/has-role';
import { Role, type SupportTicket } from '@/types';
import { useOrganizations } from '@/pages/organizations/hooks/use-organizations';
import { useSupportTickets } from '../hooks/use-support-tickets';

type Scope = 'mine' | 'org';

export default function TicketsPage() {
  const { user } = useAuth();
  const isSuperuser = hasRole(user, Role.SUPERUSER);
  const canSeeOrg = !isSuperuser && hasRole(user, MANAGEMENT_ROLES);

  const [tab, setTab] = useState<Scope>('mine');
  const [orgFilter, setOrgFilter] = useState('');

  // SUPERUSER ziet de wachtrij over alle orgs → scope is voor hem betekenisloos
  // (de backend negeert het); hij filtert in plaats daarvan op organisatie.
  const scope: Scope | undefined = isSuperuser ? undefined : canSeeOrg ? tab : 'mine';

  const { data, isLoading, error } = useSupportTickets({
    scope,
    orgId: isSuperuser && orgFilter ? orgFilter : undefined,
    limit: 50,
  });

  // Org-lijst alleen ophalen voor de superuser-console (endpoint is SUPERUSER-only).
  const { data: orgs } = useOrganizations({ enabled: isSuperuser });
  const orgOptions = [
    { value: '', label: 'Alle organisaties' },
    ...(orgs ?? []).map((o) => ({ value: o.id, label: o.name })),
  ];

  const tabs = canSeeOrg
    ? [
        { key: 'mine' as const, label: 'Mijn tickets' },
        { key: 'org' as const, label: 'Organisatie' },
      ]
    : [{ key: 'mine' as const, label: 'Mijn tickets' }];

  const ticketColumns: Column<SupportTicket>[] = [
    { key: 'number', header: '#', render: (t) => `#${t.ticketNumber}` },
    ...(isSuperuser
      ? [
          {
            key: 'org',
            header: 'Organisatie',
            render: (t: SupportTicket) => t.organization?.name ?? '—',
          },
        ]
      : []),
    {
      key: 'subject',
      header: 'Onderwerp',
      render: (t) => (
        <Link
          to={`/help/tickets/${t.id}`}
          className="font-medium text-primary-600 hover:underline"
        >
          {t.subject}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => <StatusBadge map={SUPPORT_TICKET_STATUS} status={t.status} />,
    },
    {
      key: 'priority',
      header: 'Prioriteit',
      render: (t) => <StatusBadge map={SUPPORT_TICKET_PRIORITY} status={t.priority} />,
    },
    {
      key: 'lastActivity',
      header: 'Laatste activiteit',
      render: (t) => formatDateTime(t.lastMessageAt),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        description={
          isSuperuser
            ? 'Support-wachtrij — tickets over alle organisaties.'
            : 'Je tickets en de status ervan.'
        }
        actions={
          <Link to="/help/tickets/new">
            <Button>Nieuw ticket</Button>
          </Link>
        }
      />

      {isSuperuser ? (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Organisatie</span>
          <div className="w-72">
            <Select
              options={orgOptions}
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <Tabs
          tabs={tabs}
          active={canSeeOrg ? tab : 'mine'}
          onChange={(k) => setTab(k as Scope)}
        />
      )}

      {isLoading && <Spinner size="lg" />}
      {error && <ErrorBox>Kon tickets niet laden.</ErrorBox>}

      {data && (
        <Table
          columns={ticketColumns}
          data={data.data}
          keyExtractor={(t) => t.id}
          emptyMessage="Geen tickets."
        />
      )}
    </div>
  );
}

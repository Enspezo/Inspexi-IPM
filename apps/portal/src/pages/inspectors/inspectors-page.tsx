import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/page-header';
import { Spinner, StatusBadge, Table, type Column } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { hasRole } from '@/lib/has-role';
import { MANAGEMENT_ROLES } from '@/lib/roles';
import { Role } from '@/types';
import { formatShortDate } from '@/lib/format';
import { CERTIFICATE_VALIDITY, getCertificateValidityKey } from '@/lib/status';
import { useSelectableUsers } from '@/pages/users/hooks/use-users';
import { InspectorCertificatesSection } from '@/components/inspector-certificates';
import { useInspectorCertificates } from './hooks/use-inspector-certificates';

interface InspectorRow {
  id: string;
  name: string;
  email: string;
  count: number;
  nextExpiry: string | null;
}

export default function InspectorsPage() {
  const { user } = useAuth();
  const isManagement = hasRole(user, MANAGEMENT_ROLES);

  // Een (niet-management) inspecteur ziet meteen de eigen certificaten — geen collega-lijst.
  if (!isManagement) {
    return (
      <div>
        <PageHeader
          title="Mijn certificaten"
          description="Beheer je diploma's en certificaten."
        />
        {user && <InspectorCertificatesSection userId={user.id} canEdit />}
      </div>
    );
  }

  return <InspectorsOverview />;
}

/** Management-weergave: alle inspecteurs met een certificaat-samenvatting. */
function InspectorsOverview() {
  const { data: inspectors, isLoading: loadingUsers } = useSelectableUsers(Role.INSPECTEUR);
  const { data: certsData, isLoading: loadingCerts } = useInspectorCertificates();

  const rows: InspectorRow[] = useMemo(() => {
    // Aggregeer per inspecteur: aantal + eerstvolgende (= vroegste) verloopdatum.
    const byUser = new Map<string, { count: number; nextExpiry: string | null }>();
    for (const cert of certsData?.data ?? []) {
      const entry = byUser.get(cert.userId) ?? { count: 0, nextExpiry: null };
      entry.count += 1;
      if (cert.validUntil && (!entry.nextExpiry || cert.validUntil < entry.nextExpiry)) {
        entry.nextExpiry = cert.validUntil;
      }
      byUser.set(cert.userId, entry);
    }

    return (inspectors ?? []).map((u) => {
      const summary = byUser.get(u.id);
      return {
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
        email: u.email,
        count: summary?.count ?? 0,
        nextExpiry: summary?.nextExpiry ?? null,
      };
    });
  }, [inspectors, certsData]);

  const columns: Column<InspectorRow>[] = [
    {
      key: 'name',
      header: 'Inspecteur',
      render: (r) => (
        <Link
          to={`/inspectors/${r.id}`}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {r.name}
        </Link>
      ),
    },
    { key: 'email', header: 'E-mail', render: (r) => <span className="text-gray-600">{r.email}</span> },
    {
      key: 'count',
      header: 'Certificaten',
      render: (r) => <span className="text-gray-900">{r.count}</span>,
    },
    {
      key: 'nextExpiry',
      header: 'Eerstvolgende verloop',
      render: (r) =>
        r.nextExpiry ? (
          <div className="flex items-center gap-2">
            <StatusBadge map={CERTIFICATE_VALIDITY} status={getCertificateValidityKey(r.nextExpiry)} />
            <span className="text-xs text-gray-500">{formatShortDate(r.nextExpiry)}</span>
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
  ];

  if (loadingUsers || loadingCerts) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Inspecteurs"
        description="Certificaten en diploma's per inspecteur."
      />
      <Table
        columns={columns}
        data={rows}
        keyExtractor={(r) => r.id}
        emptyMessage="Geen inspecteurs gevonden."
      />
    </div>
  );
}

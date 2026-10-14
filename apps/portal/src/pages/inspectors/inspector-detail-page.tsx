import { Link, useParams } from 'react-router-dom';
import { ErrorBox, Spinner } from '@/components/ui';
import { DetailPageLayout, SidebarSection } from '@/components/layout/detail-page-layout';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { useAuth } from '@/providers/auth-provider';
import { hasRole } from '@/lib/has-role';
import { ADMIN_ROLES, CRM_ROLES } from '@/lib/roles';
import { getErrorMessage } from '@/lib/api-client';
import { Role } from '@/types';
import { useSelectableUsers } from '@/pages/users/hooks/use-users';
import { InspectorCertificatesSection } from '@/components/inspector-certificates';

function BackLink() {
  return (
    <div className="mb-2 flex items-center gap-2 text-sm">
      <Link to="/inspectors" className="text-gray-500 hover:text-gray-700">
        Inspecteurs
      </Link>
      <span className="text-gray-400">/</span>
    </div>
  );
}

export default function InspectorDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const { data: inspectors, isLoading, error } = useSelectableUsers(Role.INSPECTEUR);

  const inspector = inspectors?.find((u) => u.id === userId);
  // canEdit volgt de backend canWrite: SUPERUSER/ORG_ADMIN, of de inspecteur zelf.
  const canEdit = hasRole(user, ADMIN_ROLES) || user?.id === userId;
  // De audit-endpoint is alleen voor office-rollen (INSPECTEUR krijgt 403).
  const canSeeAudit = hasRole(user, CRM_ROLES);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <BackLink />
        <ErrorBox>
          Fout bij het laden van de inspecteur:{' '}
          {getErrorMessage(error, 'onbekende fout')}
        </ErrorBox>
      </div>
    );
  }

  if (!userId || !inspector) {
    return (
      <div>
        <BackLink />
        <ErrorBox>Inspecteur niet gevonden.</ErrorBox>
      </div>
    );
  }

  const name =
    [inspector.firstName, inspector.lastName].filter(Boolean).join(' ') || inspector.email;

  return (
    <DetailPageLayout
      iconStrip
      sidebar={
        canSeeAudit ? (
          <SidebarSection
            icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            label="Audit"
          >
            <AuditHistory entityType="User" entityId={userId} />
          </SidebarSection>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {/* Header */}
        <div>
          <BackLink />
          <h2 className="text-2xl font-bold text-gray-900">{name}</h2>
          <p className="mt-1 text-sm text-gray-500">{inspector.email}</p>
        </div>

        <InspectorCertificatesSection userId={userId} canEdit={canEdit} />
      </div>
    </DetailPageLayout>
  );
}

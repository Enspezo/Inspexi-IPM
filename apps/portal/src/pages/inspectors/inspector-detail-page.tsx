import { Link, useParams } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { hasRole } from '@/lib/has-role';
import { ADMIN_ROLES } from '@/lib/roles';
import { Role } from '@/types';
import { useSelectableUsers } from '@/pages/users/hooks/use-users';
import { InspectorCertificatesSection } from '@/components/inspector-certificates';

export default function InspectorDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const { data: inspectors, isLoading } = useSelectableUsers(Role.INSPECTEUR);

  const inspector = inspectors?.find((u) => u.id === userId);
  // canEdit volgt de backend canWrite: SUPERUSER/ORG_ADMIN, of de inspecteur zelf.
  const canEdit = hasRole(user, ADMIN_ROLES) || user?.id === userId;

  const name = inspector
    ? [inspector.firstName, inspector.lastName].filter(Boolean).join(' ') || inspector.email
    : 'Inspecteur';

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm">
          <Link to="/inspectors" className="text-gray-500 hover:text-gray-700">
            Inspecteurs
          </Link>
          <span className="text-gray-400">/</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">{name}</h2>
        {inspector && <p className="mt-1 text-sm text-gray-500">{inspector.email}</p>}
      </div>

      {userId && <InspectorCertificatesSection userId={userId} canEdit={canEdit} />}
    </div>
  );
}

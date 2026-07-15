import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import { ErrorBox } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { UserAvailabilitySection } from '@/components/availability';

/**
 * "Mijn beschikbaarheid" (PRD-12 §12.8c). Hergebruikt UserAvailabilitySection met
 * de eigen userId en `canManage=false`: de inspecteur beheert zijn eigen
 * uitzonderingen; dienstvorm en weekschema zijn organisatie-gestuurd.
 */
export default function MyAvailabilityPage() {
  const { user } = useAuth();

  if (!user) {
    return <ErrorBox>Kon je gebruikersgegevens niet laden.</ErrorBox>;
  }

  return (
    <DetailPageLayout>
      <div className="space-y-6">
        <PageHeader
          title="Mijn beschikbaarheid"
          description="Beheer wanneer je wel of niet inzetbaar bent voor inspecties"
        />
        <UserAvailabilitySection
          userId={user.id}
          canManage={false}
          employmentType={user.employmentType ?? null}
        />
      </div>
    </DetailPageLayout>
  );
}

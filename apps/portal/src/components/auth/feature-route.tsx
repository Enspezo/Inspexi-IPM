import { Outlet } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useFeatures } from '@/providers/feature-provider';
import type { FeatureKey } from '@/lib/features';
import FeatureNotInPlanPage from '@/pages/feature-not-in-plan-page';

/**
 * Route-guard die een gegate feature afdwingt (PRD-09 §5.2). Gebruikt als
 * pathless layout-route rond een groep routes; rendert:
 *  - een loader zolang de feature-set nog binnenkomt (geen "niet in abonnement"-flits),
 *  - de `FeatureNotInPlanPage` als de org de feature niet heeft,
 *  - anders de geneste route (`<Outlet />`).
 *
 * Werkt ook bij deeplink/refresh: de guard zit op routeniveau, niet enkel in de nav.
 */
export function FeatureRoute({ feature }: { feature: FeatureKey }) {
  const { hasFeature, isLoading } = useFeatures();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!hasFeature(feature)) {
    return <FeatureNotInPlanPage />;
  }

  return <Outlet />;
}

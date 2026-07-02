import type { ReactNode } from 'react';
import { Spinner } from '@/components/ui';
import { useFeatures } from '@/providers/feature-provider';
import FeatureNotInPlanPage from '@/pages/feature-not-in-plan-page';

/**
 * Het volledige klantportaal valt onder één feature: BASIS_INSPECTIES (PRD §2.2).
 * Deze gate omhult álle routes (ook login/magic): heeft de org de feature niet, dan
 * is het hele portaal niet beschikbaar en tonen we de "niet in abonnement"-pagina —
 * ook bij deeplink/refresh. Zolang de set nog laadt tonen we een loader (geen flits).
 */
export function ClientFeatureGate({ children }: { children: ReactNode }) {
  const { hasFeature, isLoading } = useFeatures();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!hasFeature('BASIS_INSPECTIES')) {
    return <FeatureNotInPlanPage />;
  }

  return <>{children}</>;
}

import { Outlet } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import type { Role } from '@/types';
import NoAccessPage from '@/pages/no-access-page';

/**
 * Route-guard die een minimale rol afdwingt (WP-C1 / B-509), naar analogie van
 * `FeatureRoute`. Gebruikt als pathless layout-route rond een groep routes;
 * rendert:
 *  - een loader zolang de auth-state nog laadt (geen "geen toegang"-flits),
 *  - de `NoAccessPage` wanneer de gebruiker geen van de vereiste rollen heeft,
 *  - anders de geneste route (`<Outlet />`).
 *
 * Dit is UX — de RolesGuard op de API blijft de echte grens. Werkt ook bij
 * deeplink/refresh en oude bladwijzers: de guard zit op routeniveau, niet
 * enkel in de sidebar-filtering.
 */
export function RoleRoute({ roles }: { roles: Role[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user || !user.roles.some((role) => roles.includes(role))) {
    return <NoAccessPage />;
  }

  return <Outlet />;
}

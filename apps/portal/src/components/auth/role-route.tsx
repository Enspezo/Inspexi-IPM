import { Outlet } from 'react-router-dom';
import type { Role } from '@/types';
import { useAuth } from '@/providers/auth-provider';
import { hasRole } from '@/lib/has-role';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui';

/**
 * B-315 §7: route-guard op rol, analoog aan {@link FeatureRoute}. Zonder deze
 * guard rendert bijv. /contacts voor een INSPECTEUR een lege lijst ("Geen
 * relaties gevonden") terwijl de API terecht 403 geeft — een expliciet
 * "Geen toegang"-scherm is eerlijker. Gebruikt als pathless layout-route rond
 * een groep routes; werkt ook bij deeplink/refresh.
 */
export function RoleRoute({ roles }: { roles: Role[] }) {
  const { user } = useAuth();

  if (!hasRole(user, roles)) {
    return (
      <div>
        <PageHeader title="Geen toegang" />
        <Card>
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <svg
                className="h-7 w-7 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <p className="max-w-md text-base text-gray-700">
              U heeft geen toegang tot dit onderdeel. Neem contact op met uw
              beheerder als u denkt dat dit niet klopt.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return <Outlet />;
}

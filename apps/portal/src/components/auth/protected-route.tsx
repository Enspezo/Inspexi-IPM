import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { useTenant } from '@/providers/tenant-provider';
import { Spinner } from '@/components/ui';
import { Role } from '@/types';
import { hasRole } from '@/lib/has-role';
import { getOrgUrl } from '@/lib/tenant';

export function ProtectedRoute() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { tenantInfo, isLoading: tenantLoading } = useTenant();
  const location = useLocation();

  // Take no routing decision until BOTH auth-init and tenant resolution have
  // settled. This closes the load race that intermittently bounced a refreshed
  // deeplink through /login to /dashboard.
  if (authLoading || tenantLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    // Remember where the user was headed so login can return them there.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Base domain (mijn.inspexi.nl) + non-SUPERUSER → redirect to org subdomain,
  // preserving the originally requested path instead of forcing /dashboard.
  if (tenantInfo.isBaseDomain && !hasRole(user, Role.SUPERUSER)) {
    const orgSlug = user.organization?.slug;
    if (orgSlug) {
      window.location.href = getOrgUrl(
        orgSlug,
        location.pathname + location.search,
      );
      return (
        <div className="flex h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      );
    }
  }

  return <Outlet />;
}

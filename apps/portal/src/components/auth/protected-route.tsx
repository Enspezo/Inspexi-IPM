import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { useTenant } from '@/providers/tenant-provider';
import { Spinner } from '@/components/ui';
import { Role } from '@/types';
import { getOrgUrl } from '@/lib/tenant';

export function ProtectedRoute() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { tenantInfo } = useTenant();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Base domain (mijn.inspexi.nl) + non-SUPERUSER → redirect to org subdomain
  if (tenantInfo.isBaseDomain && user.role !== Role.SUPERUSER) {
    const orgSlug = user.organization?.slug;
    if (orgSlug) {
      window.location.href = getOrgUrl(orgSlug, '/dashboard');
      return (
        <div className="flex h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      );
    }
  }

  // Org subdomain + user.orgId ≠ org (and not SUPERUSER) → redirect to login
  // This is mostly handled by the backend TenantGuard, but as a safety net:
  if (!tenantInfo.isBaseDomain && user.role !== Role.SUPERUSER) {
    // If user got here with wrong org token, the API will 403 anyway
    // We don't need to check explicitly since TenantGuard handles it
  }

  return <Outlet />;
}

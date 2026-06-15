import { Navigate, Outlet } from 'react-router-dom';
import { useClientAuth } from '@/providers/client-auth-provider';
import { Spinner } from '@/components/ui';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useClientAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

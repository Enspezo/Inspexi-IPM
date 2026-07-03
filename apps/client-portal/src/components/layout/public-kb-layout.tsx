import { Link, Outlet } from 'react-router-dom';
import { useClientAuth } from '@/providers/client-auth-provider';
import { useTenant } from '@/providers/tenant-provider';

/**
 * Zelfstandige layout voor de PUBLIEKE kennisbank (zonder klant-login). Toont de
 * org-branding + een instap naar inloggen. De ingelogde kennisbank draait in de
 * gewone ClientLayout.
 */
export function PublicKbLayout() {
  const { orgBranding } = useTenant();
  const { isAuthenticated } = useClientAuth();
  const orgName = orgBranding?.name ?? 'Klantportaal';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            {orgBranding?.logoUrl ? (
              <img src={orgBranding.logoUrl} alt={orgName} className="h-8 w-auto" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold text-white">
                {orgName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm font-semibold text-gray-900">{orgName}</span>
          </div>
          <Link
            to={isAuthenticated ? '/dashboard' : '/login'}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            {isAuthenticated ? 'Naar portaal' : 'Inloggen'}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

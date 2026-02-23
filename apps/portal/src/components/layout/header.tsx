import { useState, useRef, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { Badge } from '@/components/ui';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/users': 'Gebruikers',
  '/organization/settings': 'Organisatie-instellingen',
  '/profile': 'Profiel',
  '/contacts': 'Relaties',
  '/requests': 'Aanvragen',
  '/products': 'Producten',
  '/price-tables': 'Prijstabellen',
  '/quotes': 'Offertes',
  '/quotes/new': 'Nieuwe offerte',
  '/quote-templates': 'Offerte Templates',
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.match(/^\/contacts\/[^/]+$/)) return 'Relatie detail';
  if (pathname.match(/^\/requests\/[^/]+$/)) return 'Aanvraag detail';
  if (pathname.match(/^\/price-tables\/[^/]+$/)) return 'Prijstabel detail';
  if (pathname.match(/^\/quotes\/[^/]+\/edit$/)) return 'Offerte bewerken';
  if (pathname.match(/^\/quotes\/[^/]+$/)) return 'Offerte detail';
  return 'InspeXi Beheer';
}

export function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const pageTitle = getPageTitle(location.pathname);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      {/* Page title / breadcrumb */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{pageTitle}</h1>
      </div>

      {/* User dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-gray-50"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700">
            {user?.firstName?.[0]}
            {user?.lastName?.[0]}
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-sm font-medium text-gray-700">
              {user?.firstName} {user?.lastName}
            </p>
          </div>
          <svg
            className="h-4 w-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isDropdownOpen && (
          <div
            className="absolute right-0 mt-2 w-64 rounded-xl border border-gray-200 bg-white py-2 shadow-lg"
            style={{ animation: 'fade-in 0.15s ease-out' }}
          >
            {/* User info */}
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-medium text-gray-900">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-gray-500">{user?.email}</p>
              {user && (
                <div className="mt-1.5">
                  <Badge role={user.role} />
                </div>
              )}
            </div>

            {/* Menu items */}
            <div className="py-1">
              <Link
                to="/profile"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Profiel
              </Link>
              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Uitloggen
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

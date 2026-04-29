import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { useTenant } from '@/providers/tenant-provider';
import { apiClient } from '@/lib/api-client';
import { getOrgUrl, getBaseDomainUrl } from '@/lib/tenant';
import { Role } from '@/types';
import type { Organization } from '@/types';
import { hasRole } from '@/lib/has-role';

export function OrgSwitcher() {
  const { user } = useAuth();
  const { orgBranding, tenantInfo } = useTenant();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Only visible for SUPERUSER
  if (!user || !hasRole(user, Role.SUPERUSER)) {
    return null;
  }

  // Fetch all organizations
  const { data: orgs } = useQuery({
    queryKey: ['organizations'],
    queryFn: () =>
      apiClient.get<Organization[]>('/organizations').then((data) => data),
    staleTime: 5 * 60 * 1000,
  });

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLabel = orgBranding?.name ?? 'Alle organisaties';

  const handleOrgClick = (slug: string) => {
    setIsOpen(false);
    window.location.href = getOrgUrl(slug, '/dashboard');
  };

  const handleBaseDomainClick = () => {
    setIsOpen(false);
    window.location.href = getBaseDomainUrl('/dashboard');
  };

  return (
    <div ref={ref} className="relative px-3 pb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
      >
        <svg
          className="h-4 w-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 9l4-4 4 4m0 6l-4 4-4-4"
          />
        </svg>
        <span className="truncate">{currentLabel}</span>
      </button>

      {isOpen && (
        <div className="absolute left-3 right-3 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-lg">
          {/* Base domain option */}
          <button
            onClick={handleBaseDomainClick}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-700 ${
              tenantInfo.isBaseDomain
                ? 'font-medium text-white'
                : 'text-gray-300'
            }`}
          >
            <svg
              className="h-4 w-4 shrink-0 text-primary-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Alle organisaties
            {tenantInfo.isBaseDomain && (
              <span className="ml-auto text-xs text-primary-400">actief</span>
            )}
          </button>

          {orgs && orgs.length > 0 && (
            <div className="my-1 border-t border-gray-700" />
          )}

          {orgs?.map((org) => (
            <button
              key={org.id}
              onClick={() => handleOrgClick(org.slug)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-700 ${
                orgBranding?.id === org.id
                  ? 'font-medium text-white'
                  : 'text-gray-300'
              }`}
            >
              {org.logoUrl ? (
                <img
                  src={org.logoUrl}
                  alt={org.name}
                  className="h-4 w-4 shrink-0 rounded object-contain"
                />
              ) : (
                <div
                  className="h-4 w-4 shrink-0 rounded"
                  style={{ backgroundColor: org.primaryColor ?? '#6b7280' }}
                />
              )}
              <span className="truncate">{org.name}</span>
              {orgBranding?.id === org.id && (
                <span className="ml-auto text-xs text-primary-400">actief</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

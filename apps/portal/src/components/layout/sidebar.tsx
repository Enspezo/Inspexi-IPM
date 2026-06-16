import { tenantStorage } from '@/lib/storage';
import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '@/providers/auth-provider';
import { useTenant } from '@/providers/tenant-provider';
import { OrgSwitcher } from './org-switcher';
import { Role } from '@/types';

const adminRoles: Role[] = [Role.SUPERUSER, Role.ORG_ADMIN];
const crmRoles: Role[] = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
];

interface NavChild {
  to: string;
  label: string;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles?: Role[];
  children?: NavChild[];
}

interface NavSection {
  label: string | null; // null = no section header (e.g. Dashboard)
  items: NavItem[];
}

const STORAGE_KEY = 'sidebar-collapsed';
const SECTIONS_STORAGE_KEY = 'sidebar-sections';

type CollapsedSections = Record<string, boolean>;

const mainSections: NavSection[] = [
  {
    label: 'Backoffice',
    items: [
      {
        to: '/contacts',
        label: 'Relaties',
        roles: crmRoles,
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        ),
        children: [
          { to: '/contacts', label: 'Overzicht' },
          { to: '/contacts/persons', label: 'Contactpersonen' },
          { to: '/contacts/locations', label: 'Locaties' },
          { to: '/contacts/groups', label: 'Klantgroepen' },
        ],
      },
      {
        to: '/requests',
        label: 'Aanvragen',
        roles: crmRoles,
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
      },
      {
        to: '/quotes',
        label: 'Offertes',
        roles: crmRoles,
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 2v5a2 2 0 002 2h5" />
          </svg>
        ),
      },
      {
        to: '/documents',
        label: 'Documenten',
        roles: crmRoles,
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Uitvoering',
    items: [
      {
        to: '/projects',
        label: 'Projecten',
        roles: crmRoles,
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        ),
      },
      {
        to: '/planning',
        label: 'Planning',
        roles: crmRoles,
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
        children: [
          { to: '/planning', label: 'Overzicht' },
          { to: '/work-orders', label: 'Werkbonnen' },
        ],
      },
    ],
  },
  {
    label: 'Inspecties',
    items: [
      {
        to: '/inspections',
        label: 'Inspecties',
        roles: [...crmRoles, Role.INSPECTEUR],
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        ),
      },
      {
        to: '/assets',
        label: 'Assets',
        roles: [...crmRoles, Role.INSPECTEUR],
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Persoonlijk',
    items: [
      {
        to: '/tasks',
        label: 'Taken',
        roles: crmRoles,
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        ),
      },
      {
        to: '/notities',
        label: 'Notities',
        roles: crmRoles,
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        ),
      },
      {
        to: '/notifications',
        label: 'Notificaties',
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        ),
      },
      {
        to: '/profile',
        label: 'Profiel',
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ),
      },
    ],
  },
];

// Items in het Organisatie-submenu — vervangt het hoofdmenu (Atera-stijl)
const organisatieSections: NavSection[] = [
  {
    label: 'Beheer',
    items: [
      {
        to: '/organization/settings',
        label: 'Organisatie',
        roles: adminRoles,
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        ),
        children: [
          { to: '/organization/settings', label: 'Instellingen' },
          { to: '/users', label: 'Gebruikers' },
        ],
      },
      {
        to: '/products',
        label: 'Producten',
        roles: adminRoles,
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        ),
        children: [
          { to: '/products', label: 'Overzicht' },
          { to: '/products/groups', label: 'Productgroepen' },
          { to: '/price-tables', label: 'Prijstabellen' },
        ],
      },
      {
        to: '/quote-templates',
        label: 'Templates',
        roles: adminRoles,
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
          </svg>
        ),
        children: [
          { to: '/quote-templates', label: 'Offertesjablonen' },
          { to: '/email-templates', label: 'E-mailsjablonen' },
        ],
      },
      {
        to: '/inspection-templates',
        label: 'Inspectie-config',
        roles: adminRoles,
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ),
        children: [
          { to: '/inspection-templates', label: 'Inspectie-templates' },
          { to: '/checklists', label: 'Checklists' },
          { to: '/finding-templates', label: 'Constateringen' },
          { to: '/asset-types', label: 'Asset-types' },
          { to: '/location-types', label: 'Locatie-types' },
          { to: '/lookups', label: 'Lookups' },
          { to: '/voice-prompts/template', label: 'Voice-prompts' },
        ],
      },
      {
        to: '/classification-models',
        label: 'Inspectie-systeem',
        roles: [Role.SUPERUSER],
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
        children: [
          { to: '/classification-models', label: 'Classificatiemodellen' },
          { to: '/norm-types', label: 'Normtypes' },
          { to: '/measurement-sheet-templates', label: 'Meetstaat-templates' },
          { to: '/admin/voice-prompts', label: 'Voice base-prompts' },
        ],
      },
      {
        to: '/organizations',
        label: 'Organisaties',
        roles: [Role.SUPERUSER],
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        to: '/error-reports',
        label: 'Foutmeldingen',
        roles: [Role.SUPERUSER],
        icon: (
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        ),
      },
    ],
  },
];

// Route-prefixes die bij het Organisatie-submenu horen — bepaalt de menuweergave na een refresh
const organisatieRoutePrefixes = organisatieSections
  .flatMap((s) => s.items)
  .flatMap((item) => [item.to, ...(item.children?.map((c) => c.to) ?? [])])
  .map((to) => to.split('/').slice(0, 2).join('/'));

const organisatieIcon = (
  <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

function filterSections(sections: NavSection[], user: { roles: Role[] } | null) {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!item.roles) return true;
        return user && user.roles.some((r) => item.roles!.includes(r));
      }),
    }))
    .filter((section) => section.label !== null || section.items.length > 0);
}

export function Sidebar() {
  const { user } = useAuth();
  const { orgBranding } = useTenant();
  const location = useLocation();

  // 'main' = hoofdmenu, 'organisatie' = submenu dat het hoofdmenu vervangt (Atera-stijl)
  const [menuView, setMenuView] = useState<'main' | 'organisatie'>(() =>
    organisatieRoutePrefixes.some((prefix) => window.location.pathname.startsWith(prefix))
      ? 'organisatie'
      : 'main',
  );

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return tenantStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [collapsedSections, setCollapsedSections] = useState<CollapsedSections>(() => {
    try {
      const stored = tenantStorage.getItem(SECTIONS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      tenantStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  useEffect(() => {
    try {
      tenantStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(collapsedSections));
    } catch {
      // ignore
    }
  }, [collapsedSections]);

  // Houd de menuweergave in sync met de route (bijv. logo-klik naar dashboard → hoofdmenu)
  useEffect(() => {
    setMenuView(
      organisatieRoutePrefixes.some((prefix) => location.pathname.startsWith(prefix))
        ? 'organisatie'
        : 'main',
    );
  }, [location.pathname]);

  const toggleSection = (label: string) => {
    setCollapsedSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const brandName = orgBranding?.name ?? 'InspeXi';

  // Filter sections: remove items the user can't see, then remove empty sections
  const visibleSections = filterSections(
    menuView === 'organisatie' ? organisatieSections : mainSections,
    user,
  );
  const hasOrgAccess = !!user && user.roles.some((r) => adminRoles.includes(r));
  const orgMenuActive = organisatieRoutePrefixes.some((prefix) =>
    location.pathname.startsWith(prefix),
  );

  return (
    <aside
      className={clsx(
        'flex h-screen flex-col bg-gray-900 transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Logo + collapse toggle (Atera-stijl: toggle-icoon bovenin) */}
      <div
        className={clsx(
          'flex shrink-0 items-center px-3',
          collapsed ? 'h-auto flex-col gap-1 py-3' : 'h-16 justify-between',
        )}
      >
        <Link
          to="/dashboard"
          className={clsx(
            'flex min-w-0 items-center gap-3 rounded-lg transition-colors hover:opacity-80',
            !collapsed && 'pl-3',
          )}
        >
          {orgBranding?.logoUrl ? (
            <img
              src={orgBranding.logoUrl}
              alt={orgBranding.name}
              className="h-8 w-8 shrink-0 rounded-lg object-contain"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-600">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          )}
          {!collapsed && (
            <span className="text-lg font-bold text-white truncate">{brandName}</span>
          )}
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          title={collapsed ? 'Menu uitklappen' : 'Menu inklappen'}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5.25A2.25 2.25 0 016.25 3h11.5A2.25 2.25 0 0120 5.25v13.5A2.25 2.25 0 0117.75 21H6.25A2.25 2.25 0 014 18.75V5.25z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.5 3v18" />
          </svg>
        </button>
      </div>

      {/* Org Switcher (SUPERUSER only) — hidden when collapsed */}
      {!collapsed && <OrgSwitcher />}

      {/* Submenu-header met terugknop naar hoofdmenu */}
      {menuView === 'organisatie' && (
        <button
          onClick={() => setMenuView('main')}
          title={collapsed ? 'Terug naar hoofdmenu' : undefined}
          className={clsx(
            'mx-2 mb-1 flex shrink-0 items-center rounded-lg py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800',
            collapsed ? 'justify-center px-0' : 'gap-2 px-3',
          )}
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7 7-7m-7 7h18" />
          </svg>
          {!collapsed && <span>Organisatie</span>}
        </button>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {visibleSections.map((section, sectionIdx) => {
          const sectionIsCollapsed = !!(section.label && collapsedSections[section.label]);

          return (
            <div key={section.label ?? 'top'} className={sectionIdx > 0 ? 'mt-3' : ''}>
              {/* Organisatie-trigger: opent het submenu dat het hoofdmenu vervangt */}
              {menuView === 'main' && section.label === 'Persoonlijk' && hasOrgAccess && (
                <div className="mb-3">
                  {collapsed ? (
                    <div className="mx-2 my-2 border-t border-gray-700" />
                  ) : (
                    <div className="mb-1 px-3 pt-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Organisatie
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => setMenuView('organisatie')}
                    title={collapsed ? 'Organisatie' : undefined}
                    className={clsx(
                      'flex w-full items-center rounded-lg text-sm font-medium transition-colors duration-150',
                      collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2',
                      orgMenuActive
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white',
                    )}
                  >
                    {organisatieIcon}
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left">Organisatie</span>
                        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Section header */}
              {section.label && (
                collapsed ? (
                  <div className="mx-2 my-2 border-t border-gray-700" />
                ) : (
                  <button
                    onClick={() => toggleSection(section.label!)}
                    className="flex w-full items-center justify-between mb-1 px-3 pt-1 group"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 group-hover:text-gray-400">
                      {section.label}
                    </span>
                    <svg
                      className={clsx(
                        'h-3.5 w-3.5 text-gray-600 transition-transform duration-150 group-hover:text-gray-400',
                        sectionIsCollapsed ? 'rotate-0' : 'rotate-180',
                      )}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )
              )}

              {/* Items — hidden when section is collapsed (only in expanded sidebar) */}
              {!(sectionIsCollapsed && !collapsed) && (
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const isParentActive =
                      location.pathname.startsWith(item.to) ||
                      (item.children?.some((c) => location.pathname.startsWith(c.to)) ?? false);
                    const hasChildren = item.children && item.children.length > 0;
                    const showChildren = hasChildren && isParentActive && !collapsed;

                    return (
                      <div key={item.to}>
                        <NavLink
                          to={item.to}
                          end={hasChildren}
                          title={collapsed ? item.label : undefined}
                          className={({ isActive }) =>
                            clsx(
                              'flex items-center rounded-lg text-sm font-medium transition-colors duration-150',
                              collapsed
                                ? 'justify-center px-0 py-2.5'
                                : 'gap-3 px-3 py-2',
                              isActive || (hasChildren && isParentActive)
                                ? 'bg-gray-800 text-white'
                                : 'text-gray-400 hover:bg-gray-800 hover:text-white',
                            )
                          }
                        >
                          {item.icon}
                          {!collapsed && <span>{item.label}</span>}
                        </NavLink>

                        {/* Submenu */}
                        {showChildren && (
                          <div className="ml-8 mt-1 space-y-0.5">
                            {item.children!.map((child) => (
                              <NavLink
                                key={child.to}
                                to={child.to}
                                end
                                className={({ isActive }) =>
                                  clsx(
                                    'block rounded-md px-3 py-1.5 text-sm transition-colors duration-150',
                                    isActive
                                      ? 'text-white font-medium'
                                      : 'text-gray-500 hover:text-gray-300',
                                  )
                                }
                              >
                                {child.label}
                              </NavLink>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

    </aside>
  );
}

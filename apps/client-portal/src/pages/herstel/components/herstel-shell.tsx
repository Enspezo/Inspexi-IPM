import type { ReactNode } from 'react';
import { useTenant } from '@/providers/tenant-provider';

/**
 * Visuele schil voor de publieke herstel-pagina's (PRD-14): org-branding
 * bovenaan, mobile-first één kolom — externen staan op de bouwplaats en werken
 * doorgaans op een telefoon. Grote tap-targets, geen portaal-navigatie.
 */
export function HerstelShell({
  subtitle,
  wide = false,
  children,
}: {
  subtitle: string;
  /** true → bredere kolom (overzicht/wizard); false → smalle formulier-kaart. */
  wide?: boolean;
  children: ReactNode;
}) {
  const { orgBranding } = useTenant();
  const orgName = orgBranding?.name ?? 'Klantportaal';

  return (
    <div className="min-h-screen bg-gray-50 px-4 pb-28 pt-8">
      <div className={`mx-auto w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="mb-6 text-center">
          {orgBranding?.logoUrl ? (
            <img src={orgBranding.logoUrl} alt={orgName} className="mx-auto mb-3 h-12 w-auto" />
          ) : (
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-600 text-xl font-bold text-white">
              {orgName.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-xl font-bold text-gray-900">{orgName}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

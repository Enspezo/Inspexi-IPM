import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui';

/**
 * Getoond wanneer een gebruiker een route bezoekt waarvan de feature niet in het
 * abonnement van de organisatie zit (PRD-09 §5.2). Rendert binnen de AppLayout,
 * dus met de gewone sidebar eromheen.
 */
export default function FeatureNotInPlanPage() {
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
            Deze functie zit niet in uw abonnement. Neem contact op met uw beheerder.
          </p>
        </div>
      </Card>
    </div>
  );
}

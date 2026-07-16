import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Card, ErrorBox, Input } from '@/components/ui';
import { useFeatures } from '@/providers/feature-provider';
import { ApiClientError, getErrorMessage } from '@/lib/api-client';
import { hasRepairToken } from '@/lib/repair-token';
import { useRepairLookup } from './hooks/use-repair';
import { HerstelShell } from './components/herstel-shell';

const lookupSchema = z.object({
  referenceNumber: z.string().trim().min(1, 'Rapportnummer is verplicht'),
  postalCode: z.string().trim().min(1, 'Postcode is verplicht'),
});

type LookupFormData = z.infer<typeof lookupSchema>;

/**
 * Anonieme toegang tot online herstel (PRD §14.9.1): rapportnummer + postcode.
 * Publieke route — de servermelding is bewust generiek (anti-enumeratie) en
 * wordt 1-op-1 getoond.
 */
export default function HerstelLookupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasFeature } = useFeatures();
  const lookup = useRepairLookup();
  const [error, setError] = useState<string | null>(null);

  // Bericht van een redirect (bijv. "sessie verlopen" vanuit het overzicht).
  const redirectMessage = (location.state as { message?: string } | null)?.message ?? null;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LookupFormData>({ resolver: zodResolver(lookupSchema) });

  // Feature bekend én afwezig → geen formulier (fail-open zolang onbekend; de
  // backend geeft sowieso de generieke melding).
  if (!hasFeature('ONLINE_HERSTEL')) {
    return (
      <HerstelShell subtitle="Online herstel">
        <Card>
          <p className="py-2 text-center text-sm text-gray-600">
            Online herstel is niet beschikbaar voor deze organisatie.
          </p>
        </Card>
      </HerstelShell>
    );
  }

  const onSubmit = async (data: LookupFormData) => {
    setError(null);
    try {
      await lookup.mutateAsync({
        referenceNumber: data.referenceNumber,
        postalCode: data.postalCode,
      });
      navigate('/herstel/overzicht');
    } catch (err) {
      if (err instanceof ApiClientError && err.statusCode === 429) {
        setError('Te veel pogingen. Wacht even en probeer het opnieuw.');
      } else {
        setError(getErrorMessage(err, 'Er ging iets mis. Probeer het opnieuw.'));
      }
    }
  };

  return (
    <HerstelShell subtitle="Online herstel van constateringen">
      <Card>
        <div className="space-y-5">
          <p className="text-sm text-gray-600">
            Voer het rapportnummer van de inspectie en de postcode van het inspectieadres in om
            herstelwerkzaamheden te melden.
          </p>

          {redirectMessage && (
            <div className="rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-600" role="status">
              {redirectMessage}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <Input
              label="Rapportnummer"
              placeholder="Bijv. RAP-2026-001"
              autoComplete="off"
              error={errors.referenceNumber?.message}
              {...register('referenceNumber')}
            />
            <Input
              label="Postcode"
              placeholder="1234 AB"
              autoComplete="postal-code"
              error={errors.postalCode?.message}
              {...register('postalCode')}
            />

            <ErrorBox>{error}</ErrorBox>

            <Button type="submit" size="lg" className="w-full" isLoading={lookup.isPending}>
              Naar de constateringen
            </Button>
          </form>

          {hasRepairToken() && (
            <button
              type="button"
              onClick={() => navigate('/herstel/overzicht')}
              className="block w-full text-center text-sm font-medium text-primary-600 hover:underline"
            >
              Verder met uw huidige sessie →
            </button>
          )}
        </div>
      </Card>
    </HerstelShell>
  );
}

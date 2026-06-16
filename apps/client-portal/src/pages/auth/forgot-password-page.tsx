import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTenant } from '@/providers/tenant-provider';
import { apiClient } from '@/lib/api-client';
import { Button, Input, Card, ErrorBox } from '@/components/ui';

/** Gedeelde visuele schil voor de auth-pagina's: gecentreerd, org-branding, witte kaart. */
function AuthShell({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  const { orgBranding } = useTenant();
  const orgName = orgBranding?.name ?? 'Klantportaal';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          {orgBranding?.logoUrl ? (
            <img
              src={orgBranding.logoUrl}
              alt={orgName}
              className="mx-auto mb-4 h-14 w-auto"
            />
          ) : (
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-2xl font-bold text-white">
              {orgName.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900">{orgName}</h1>
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
        </div>
        <Card>{children}</Card>
      </div>
    </div>
  );
}

const forgotSchema = z.object({
  email: z.string().email('Voer een geldig e-mailadres in'),
});

type ForgotFormData = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotFormData) => {
    setError(null);
    setSubmitting(true);
    try {
      // Backend geeft altijd een generieke succesrespons — onthul nooit of een account bestaat.
      await apiClient.post('/client/auth/forgot-password', { email: data.email });
      setSuccess(true);
    } catch {
      setError('Er ging iets mis. Probeer het later opnieuw.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell subtitle="Wachtwoord vergeten">
      {success ? (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <p className="text-sm text-gray-700">
            Als er een account bestaat, is er een reset-e-mail verstuurd.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <p className="text-sm text-gray-600">
            Vul uw e-mailadres in. Als er een account bekend is, ontvangt u een link om uw
            wachtwoord opnieuw in te stellen.
          </p>

          <Input
            label="E-mailadres"
            type="email"
            placeholder="naam@bedrijf.nl"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <ErrorBox>{error}</ErrorBox>

          <Button type="submit" className="w-full" isLoading={submitting}>
            Resetlink versturen
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm">
        <Link
          to="/login"
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Terug naar inloggen
        </Link>
      </p>
    </AuthShell>
  );
}

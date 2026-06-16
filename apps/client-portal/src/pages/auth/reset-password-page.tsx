import { useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTenant } from '@/providers/tenant-provider';
import { apiClient, getErrorMessage } from '@/lib/api-client';
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

const resetSchema = z
  .object({
    password: z.string().min(8, 'Wachtwoord moet minimaal 8 tekens zijn'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Wachtwoorden komen niet overeen',
    path: ['confirmPassword'],
  });

type ResetFormData = z.infer<typeof resetSchema>;

export default function ResetPasswordPage() {
  const { token: paramToken } = useParams();
  const [sp] = useSearchParams();
  const token = paramToken ?? sp.get('token') ?? '';

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  });

  if (!token) {
    return (
      <AuthShell subtitle="Wachtwoord opnieuw instellen">
        <p className="text-sm text-gray-600">Ongeldige of ontbrekende reset-link</p>
        <Link
          to="/login"
          className="mt-4 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          Naar inloggen
        </Link>
      </AuthShell>
    );
  }

  const onSubmit = async (data: ResetFormData) => {
    setError(null);
    setSubmitting(true);
    try {
      // Let op: het backend-veld heet `password` (niet newPassword).
      await apiClient.post('/client/auth/reset-password', { token, password: data.password });
      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Er ging iets mis. De link is mogelijk verlopen.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell subtitle="Wachtwoord opnieuw instellen">
      {success ? (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <p className="text-sm text-gray-700">Uw wachtwoord is succesvol gewijzigd.</p>
          <Link
            to="/login"
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            Naar inloggen
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Input
            label="Nieuw wachtwoord"
            type="password"
            autoComplete="new-password"
            helperText="Minimaal 8 tekens"
            error={errors.password?.message}
            {...register('password')}
          />

          <Input
            label="Wachtwoord bevestigen"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <ErrorBox>{error}</ErrorBox>

          <Button type="submit" className="w-full" isLoading={submitting}>
            Wachtwoord wijzigen
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

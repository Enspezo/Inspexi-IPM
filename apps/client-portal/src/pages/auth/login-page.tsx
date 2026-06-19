import { useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useClientAuth } from '@/providers/client-auth-provider';
import { useTenant } from '@/providers/tenant-provider';
import { getErrorMessage } from '@/lib/api-client';
import { Button, Input, Card, ErrorBox, Spinner } from '@/components/ui';

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

const loginSchema = z.object({
  email: z.string().email('Voer een geldig e-mailadres in'),
  password: z.string().min(1, 'Wachtwoord is verplicht'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useClientAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    );
  }

  const onSubmit = async (data: LoginFormData) => {
    setError(null);
    setSubmitting(true);
    try {
      // De provider zet de user → de isAuthenticated-guard hierboven redirect naar /dashboard.
      await login(data.email, data.password);
    } catch (err) {
      setError(getErrorMessage(err, 'Inloggen mislukt'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell subtitle="Log in om verder te gaan">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <Input
          label="E-mailadres"
          type="email"
          placeholder="naam@bedrijf.nl"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Wachtwoord"
          type="password"
          placeholder="Voer uw wachtwoord in"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <ErrorBox>{error}</ErrorBox>

        <Button type="submit" className="w-full" isLoading={submitting}>
          Inloggen
        </Button>
      </form>

      <div className="mt-6 space-y-2 text-center text-sm">
        <Link
          to="/forgot-password"
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Wachtwoord vergeten?
        </Link>
        <p className="text-gray-500">
          Nog geen account?{' '}
          <Link
            to="/register"
            className="font-medium text-primary-600 hover:text-primary-700"
          >
            Registreren
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

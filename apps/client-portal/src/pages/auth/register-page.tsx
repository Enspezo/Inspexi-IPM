import { useState, type ReactNode } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useClientAuth } from '@/providers/client-auth-provider';
import { useTenant } from '@/providers/tenant-provider';
import { getErrorMessage } from '@/lib/api-client';
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

const registerSchema = z
  .object({
    firstName: z.string().min(1, 'Voornaam is verplicht'),
    lastName: z.string().min(1, 'Achternaam is verplicht'),
    email: z.string().email('Voer een geldig e-mailadres in'),
    password: z.string().min(8, 'Wachtwoord moet minimaal 8 tekens zijn'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Wachtwoorden komen niet overeen',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const { register: registerAccount, isAuthenticated } = useClientAuth();
  const [searchParams] = useSearchParams();
  const magicLinkToken = searchParams.get('token') ?? '';
  const prefillEmail = searchParams.get('email') ?? '';

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: prefillEmail },
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  // Registreren kan uitsluitend via een geldige uitnodigingslink (magic-link-token).
  if (!magicLinkToken) {
    return (
      <AuthShell subtitle="Registreren">
        <p className="text-sm text-gray-600">
          Registreren kan alleen via een uitnodigingslink. Vraag uw contactpersoon om een
          nieuwe uitnodiging als u geen link (meer) heeft.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          Naar inloggen
        </Link>
      </AuthShell>
    );
  }

  const onSubmit = async (data: RegisterFormData) => {
    setError(null);
    setSubmitting(true);
    try {
      // De provider zet de user → de isAuthenticated-guard hierboven redirect naar /dashboard.
      await registerAccount({
        magicLinkToken,
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Registreren mislukt'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell subtitle="Maak uw account aan">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Voornaam"
            autoComplete="given-name"
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <Input
            label="Achternaam"
            autoComplete="family-name"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>

        <Input
          label="E-mailadres"
          type="email"
          autoComplete="email"
          readOnly={!!prefillEmail}
          className={prefillEmail ? 'read-only:bg-gray-50 read-only:text-gray-500' : undefined}
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Wachtwoord"
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
          Account aanmaken
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Heeft u al een account?{' '}
        <Link
          to="/login"
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Inloggen
        </Link>
      </p>
    </AuthShell>
  );
}

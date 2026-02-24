import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/providers/auth-provider';
import { useTenant } from '@/providers/tenant-provider';
import { Button, Input, Spinner } from '@/components/ui';

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'E-mailadres is verplicht')
    .email('Ongeldig e-mailadres'),
  password: z
    .string()
    .min(1, 'Wachtwoord is verplicht'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const { orgBranding, isLoading: tenantLoading, error: tenantError } = useTenant();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const onSubmit = async (data: LoginFormData) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(data.email, data.password);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Inloggen mislukt. Controleer uw gegevens.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || tenantLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900">
        <Spinner size="lg" />
      </div>
    );
  }

  if (tenantError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-600 via-gray-700 to-gray-900 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Organisatie niet gevonden</h1>
          <p className="mt-2 text-gray-300">
            Controleer het webadres of neem contact op met uw beheerder.
          </p>
        </div>
      </div>
    );
  }

  const brandName = orgBranding?.name ?? 'InspeXi Beheer';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          {orgBranding?.logoUrl ? (
            <img
              src={orgBranding.logoUrl}
              alt={orgBranding.name}
              className="mx-auto mb-4 h-14 w-auto"
            />
          ) : (
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
              <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">{brandName}</h1>
          <p className="mt-1 text-sm text-primary-200">
            Log in om verder te gaan
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {error && (
              <div className="rounded-lg bg-danger-50 p-3 text-sm text-danger-600">
                {error}
              </div>
            )}

            <Input
              label="E-mailadres"
              type="email"
              placeholder="naam@bedrijf.nl"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  Wachtwoord
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-primary-600 hover:text-primary-700"
                >
                  Wachtwoord vergeten?
                </Link>
              </div>
              <Input
                type="password"
                placeholder="Voer uw wachtwoord in"
                autoComplete="current-password"
                error={errors.password?.message}
                {...register('password')}
              />
            </div>

            <Button
              type="submit"
              isLoading={isSubmitting}
              className="w-full"
              size="lg"
            >
              Inloggen
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-primary-300">
          &copy; {new Date().getFullYear()} {orgBranding?.name ?? 'InspeXi'}. Alle rechten voorbehouden.
        </p>
      </div>
    </div>
  );
}

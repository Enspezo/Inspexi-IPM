import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/providers/auth-provider';
import { useTenant } from '@/providers/tenant-provider';
import { Button, Checkbox, Input, Spinner } from '@/components/ui';

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
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showRememberInfo, setShowRememberInfo] = useState(false);

  // Where to send the user once authenticated: back to the route they were
  // trying to reach (set by ProtectedRoute), falling back to the dashboard.
  const from = (
    location.state as { from?: { pathname: string; search?: string } } | null
  )?.from;
  const redirectTo = from ? `${from.pathname}${from.search ?? ''}` : '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, redirectTo]);

  const onSubmit = async (data: LoginFormData) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(data.email, data.password, rememberMe);
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
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Voer uw wachtwoord in"
                  autoComplete="current-password"
                  className="pr-10"
                  error={errors.password?.message}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
                  aria-pressed={showPassword}
                  className="absolute right-0 top-0 flex h-[38px] w-10 items-center justify-center text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:text-primary-600"
                >
                  {showPassword ? (
                    // Eye-off
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
                    </svg>
                  ) : (
                    // Eye
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Onthoud mij + uitleg */}
            <div className="flex items-center gap-1.5">
              <Checkbox
                label="Onthoud mij"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <div className="relative flex items-center">
                <button
                  type="button"
                  onClick={() => setShowRememberInfo((v) => !v)}
                  onBlur={() => setShowRememberInfo(false)}
                  aria-label="Uitleg over onthoud mij"
                  aria-expanded={showRememberInfo}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:text-primary-600"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
                </button>
                {showRememberInfo && (
                  <div
                    role="tooltip"
                    className="absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg"
                  >
                    Aangevinkt blijft u op dit apparaat 30 dagen ingelogd.
                    Uitgezet eindigt uw sessie zodra u de browser sluit — gebruik
                    dit op een gedeeld of openbaar apparaat.
                    <span className="absolute left-1/2 top-full -ml-1 h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-gray-900" />
                  </div>
                )}
              </div>
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

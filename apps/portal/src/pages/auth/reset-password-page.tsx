import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { Button, Input } from '@/components/ui';

const schema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'Wachtwoord moet minimaal 8 tekens bevatten'),
    confirmPassword: z.string().min(1, 'Bevestig uw wachtwoord'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Wachtwoorden komen niet overeen',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  // Geen token in de URL → toon foutmelding
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            Ongeldige resetlink
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Deze resetlink is ongeldig of ontbreekt. Vraag een nieuwe
            resetlink aan.
          </p>
          <Link
            to="/forgot-password"
            className="mt-4 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            Nieuw resetlink aanvragen
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = async (data: FormData) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await apiClient.post('/auth/reset-password', {
        token,
        newPassword: data.newPassword,
      });
      setIsSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Er is een fout opgetreden. De resetlink is mogelijk verlopen.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Nieuw wachtwoord</h1>
          <p className="mt-1 text-sm text-primary-200">
            Kies een sterk nieuw wachtwoord voor uw account
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          {isSuccess ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Wachtwoord gewijzigd!
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Uw wachtwoord is succesvol gewijzigd. U wordt automatisch
                doorgestuurd naar de inlogpagina...
              </p>
              <Link
                to="/login"
                className="mt-4 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                Direct inloggen
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Wachtwoord instellen
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Kies een nieuw wachtwoord van minimaal 8 tekens.
                </p>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                  {error.toLowerCase().includes('verlopen') && (
                    <span>
                      {' '}
                      <Link
                        to="/forgot-password"
                        className="font-medium underline"
                      >
                        Vraag een nieuwe link aan.
                      </Link>
                    </span>
                  )}
                </div>
              )}

              <Input
                label="Nieuw wachtwoord"
                type="password"
                placeholder="Minimaal 8 tekens"
                autoComplete="new-password"
                autoFocus
                error={errors.newPassword?.message}
                {...register('newPassword')}
              />

              <Input
                label="Wachtwoord bevestigen"
                type="password"
                placeholder="Herhaal uw wachtwoord"
                autoComplete="new-password"
                error={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />

              <Button
                type="submit"
                isLoading={isSubmitting}
                className="w-full"
                size="lg"
              >
                Wachtwoord opslaan
              </Button>

              <div className="text-center">
                <Link
                  to="/login"
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Terug naar inloggen
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

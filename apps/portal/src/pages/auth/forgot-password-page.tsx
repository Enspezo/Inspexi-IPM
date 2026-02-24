import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { Button, Input } from '@/components/ui';

const schema = z.object({
  email: z
    .string()
    .min(1, 'E-mailadres is verplicht')
    .email('Ongeldig e-mailadres'),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await apiClient.post('/auth/forgot-password', { email: data.email });
      setIsSuccess(true);
    } catch (err) {
      // Altijd succes tonen (security: geen email-enumeration)
      setIsSuccess(true);
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
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Wachtwoord vergeten</h1>
          <p className="mt-1 text-sm text-primary-200">
            Vul uw e-mailadres in om een resetlink te ontvangen
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
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Controleer uw inbox
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Als er een account bestaat voor dit e-mailadres, ontvangt u
                binnen enkele minuten een e-mail met instructies om uw
                wachtwoord te resetten.
              </p>
              <Link
                to="/login"
                className="mt-6 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                ← Terug naar inloggen
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <Input
                label="E-mailadres"
                type="email"
                placeholder="naam@bedrijf.nl"
                autoComplete="email"
                autoFocus
                error={errors.email?.message}
                {...register('email')}
              />

              <Button
                type="submit"
                isLoading={isSubmitting}
                className="w-full"
                size="lg"
              >
                Resetlink versturen
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

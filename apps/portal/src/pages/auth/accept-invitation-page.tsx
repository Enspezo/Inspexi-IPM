import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { Button, Input, Spinner } from '@/components/ui';

const acceptSchema = z
  .object({
    firstName: z.string().min(1, 'Voornaam is verplicht'),
    lastName: z.string().min(1, 'Achternaam is verplicht'),
    password: z
      .string()
      .min(8, 'Wachtwoord moet minimaal 8 tekens bevatten'),
    confirmPassword: z.string().min(1, 'Bevestig uw wachtwoord'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Wachtwoorden komen niet overeen',
    path: ['confirmPassword'],
  });

type AcceptFormData = z.infer<typeof acceptSchema>;

interface InvitationInfo {
  email: string;
  role: string;
  organizationName: string;
  expiresAt: string;
}

export default function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // B-511 §7: valideer het token bij het laden van de pagina, zodat een
  // verlopen of al gebruikte uitnodiging direct een duidelijke melding geeft —
  // en niet pas nadat naam + wachtwoord al zijn ingetypt.
  const {
    data: invitation,
    isLoading: isValidating,
    error: invitationError,
  } = useQuery<InvitationInfo>({
    queryKey: ['invitation', token],
    queryFn: () => apiClient.get<InvitationInfo>(`/users/invitation/${token}`),
    enabled: !!token,
    retry: false,
    // Eigen foutscherm hieronder — geen globale error-toast nodig.
    meta: { suppressErrorToast: true },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcceptFormData>({
    resolver: zodResolver(acceptSchema),
  });

  const onSubmit = async (data: AcceptFormData) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await apiClient.post('/users/accept-invitation', {
        token,
        firstName: data.firstName,
        lastName: data.lastName,
        password: data.password,
      });
      setIsSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Er is een fout opgetreden bij het accepteren van de uitnodiging.',
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
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">InspeXi Beheer</h1>
          <p className="mt-1 text-sm text-primary-200">
            Uitnodiging accepteren
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          {isValidating ? (
            <div className="flex flex-col items-center py-8">
              <Spinner size="lg" />
              <p className="mt-4 text-sm text-gray-600">Uitnodiging controleren...</p>
            </div>
          ) : invitationError ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-50">
                <svg className="h-6 w-6 text-danger-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 5a7 7 0 100 14 7 7 0 000-14z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Uitnodiging niet geldig
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {getErrorMessage(
                  invitationError,
                  'Deze uitnodiging is niet (meer) geldig.',
                )}
              </p>
              <p className="mt-2 text-sm text-gray-500">
                Vraag uw beheerder om een nieuwe uitnodiging te versturen.
              </p>
              <Link
                to="/login"
                className="mt-4 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                Naar de inlogpagina
              </Link>
            </div>
          ) : isSuccess ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-50">
                <svg className="h-6 w-6 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Account aangemaakt!
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Uw account is succesvol aangemaakt. U wordt doorgestuurd naar de
                inlogpagina...
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
                  Welkom bij InspeXi
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  {invitation
                    ? `U bent uitgenodigd voor ${invitation.organizationName} (${invitation.email}). Vul uw gegevens in om uw account aan te maken.`
                    : 'Vul uw gegevens in om uw account aan te maken.'}
                </p>
              </div>

              {error && (
                <div className="rounded-lg bg-danger-50 p-3 text-sm text-danger-600">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Voornaam"
                  placeholder="Jan"
                  error={errors.firstName?.message}
                  {...register('firstName')}
                />
                <Input
                  label="Achternaam"
                  placeholder="Janssen"
                  error={errors.lastName?.message}
                  {...register('lastName')}
                />
              </div>

              <Input
                label="Wachtwoord"
                type="password"
                placeholder="Minimaal 8 tekens"
                error={errors.password?.message}
                {...register('password')}
              />

              <Input
                label="Wachtwoord bevestigen"
                type="password"
                placeholder="Herhaal uw wachtwoord"
                error={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />

              <Button
                type="submit"
                isLoading={isSubmitting}
                className="w-full"
                size="lg"
              >
                Account aanmaken
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

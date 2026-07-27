import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useClientAuth } from '@/providers/client-auth-provider';
import { useTenant } from '@/providers/tenant-provider';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { Card, Spinner } from '@/components/ui';
import type { MagicLinkResult } from '@/types';

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

type Status = 'loading' | 'register' | 'error';

export default function MagicLinkPage() {
  const { token: paramToken } = useParams();
  const [sp] = useSearchParams();
  const token = paramToken ?? sp.get('token') ?? '';

  const { loginWithToken, logout, isAuthenticated, isLoading } = useClientAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ email: string; inspectionPlanId: string | null } | null>(null);
  const [endedPreviousSession, setEndedPreviousSession] = useState(false);

  // B-411: lees de auth-status via een ref zodat de logout hieronder het
  // verify-effect niet opnieuw triggert (en de link niet dubbel valideert).
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;

  useEffect(() => {
    // Wacht tot het sessieherstel (refresh-cookie) klaar is — anders missen we
    // een nog-actieve sessie van een vorige gebruiker (B-411).
    if (isLoading) return;
    if (!token) {
      setStatus('error');
      setError('Ongeldige of ontbrekende link');
      return;
    }

    let cancelled = false;
    async function verify() {
      try {
        const res = await apiClient.post<MagicLinkResult>('/client/auth/magic-link', { token });
        if (cancelled) return;
        if (res.requiresRegistration === false) {
          loginWithToken(res.accessToken, res.user);
          navigate('/dashboard', { replace: true });
        } else {
          // B-411 (WP-C2): de uitnodiging is voor een e-mailadres ZONDER account.
          // Een nog-actieve sessie is dus per definitie van iemand anders
          // (gedeelde werkplek). Beëindig die expliciet — anders stuurt de
          // /register-guard de nieuwe collega stilzwijgend naar het dashboard
          // van de vórige gebruiker. Logout eerst (server-side revoke), daarna
          // pas de registratie-CTA tonen.
          if (isAuthenticatedRef.current) {
            await logout();
            if (cancelled) return;
            setEndedPreviousSession(true);
          }
          setInfo({ email: res.email, inspectionPlanId: res.inspectionPlanId });
          setStatus('register');
        }
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setError(getErrorMessage(err, 'Link is ongeldig of verlopen'));
      }
    }
    verify();
    return () => {
      cancelled = true;
    };
  }, [token, isLoading, loginWithToken, logout, navigate]);

  if (status === 'loading') {
    return (
      <AuthShell subtitle="Een moment geduld">
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <Spinner size="lg" />
          <p className="text-sm text-gray-600">Link wordt geverifieerd…</p>
        </div>
      </AuthShell>
    );
  }

  if (status === 'error') {
    return (
      <AuthShell subtitle="Er ging iets mis">
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-50 text-danger-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
          <p className="text-sm text-gray-700">{error}</p>
          <Link
            to="/login"
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            Naar inloggen
          </Link>
        </div>
      </AuthShell>
    );
  }

  // status === 'register'
  return (
    <AuthShell subtitle="Welkom">
      <div className="space-y-5 text-center">
        {endedPreviousSession && (
          <p className="rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-600">
            Er was in deze browser nog een andere gebruiker ingelogd; die sessie is
            voor de zekerheid beëindigd.
          </p>
        )}
        <p className="text-sm text-gray-600">
          U heeft nog geen account. Maak er een aan om uw inspectie(s) in te zien
          {info?.email ? (
            <>
              {' '}voor <span className="font-medium text-gray-900">{info.email}</span>
            </>
          ) : null}
          .
        </p>
        <div className="space-y-2">
          <Link
            to={`/register?email=${encodeURIComponent(info?.email ?? '')}&token=${encodeURIComponent(token)}`}
            className="block w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            Account aanmaken
          </Link>
          <Link
            to="/login"
            className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            Ik heb al een account
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}

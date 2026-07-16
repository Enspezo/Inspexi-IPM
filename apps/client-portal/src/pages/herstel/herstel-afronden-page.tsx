import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  Button,
  Card,
  Checkbox,
  ErrorBox,
  Input,
  SignatureCanvas,
  Spinner,
  useToast,
} from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { hasRepairToken } from '@/lib/repair-token';
import {
  downloadRepairDeclarationPdf,
  useCompleteRepair,
  useRepairSession,
  useRepairSessionExpiredRedirect,
  useSignRepair,
} from './hooks/use-repair';
import { HerstelShell } from './components/herstel-shell';
import type { RepairCompleteResult } from '@/types';

type WizardStep = 1 | 2 | 3 | 4 | 'done';

const STEPS: Array<{ nr: 1 | 2 | 3 | 4; label: string }> = [
  { nr: 1, label: 'Selectie' },
  { nr: 2, label: 'Gegevens' },
  { nr: 3, label: 'Controle' },
  { nr: 4, label: 'Ondertekenen' },
];

function StepIndicator({ step }: { step: WizardStep }) {
  const current = step === 'done' ? 4 : step;
  return (
    <div className="mb-5 flex items-center justify-between gap-1">
      {STEPS.map((s, i) => (
        <div key={s.nr} className="flex flex-1 items-center">
          <div className="flex flex-col items-center">
            <span
              className={clsx(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                current >= s.nr ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500',
              )}
            >
              {current > s.nr || step === 'done' ? '✓' : s.nr}
            </span>
            <span
              className={clsx(
                'mt-1 whitespace-nowrap text-[11px]',
                current === s.nr && step !== 'done' ? 'font-semibold text-primary-700' : 'text-gray-500',
              )}
            >
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={clsx('mx-1 h-0.5 flex-1', current > s.nr ? 'bg-primary-600' : 'bg-gray-200')} />
          )}
        </div>
      ))}
    </div>
  );
}

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/**
 * Afronden-wizard (PRD §14.9.4): (1) selectie van eigen REPORTED-meldingen,
 * (2) invullergegevens, (3) preview van de concept-herstelverklaring,
 * (4) ondertekenen met de SignatureCanvas → bevestiging + PDF-download.
 */
export default function HerstelAfrondenPage() {
  useRepairSessionExpiredRedirect();
  const { showToast } = useToast();
  const { data, isLoading } = useRepairSession();
  const complete = useCompleteRepair();
  const sign = useSignRepair();

  const [step, setStep] = useState<WizardStep>(1);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ contactName?: string; email?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RepairCompleteResult | null>(null);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  // Eigen meldingen + conflicten uit het sessie-overzicht.
  const myReported = useMemo(
    () => (data?.findings ?? []).filter((f) => f.repair?.isMine),
    [data],
  );
  const myConflicts = useMemo(
    () => (data?.findings ?? []).filter((f) => f.myConflict),
    [data],
  );

  if (!hasRepairToken()) {
    return <Navigate to="/herstel" replace />;
  }

  if (isLoading || !data) {
    return (
      <HerstelShell subtitle="Afronden" wide>
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      </HerstelShell>
    );
  }

  const { session } = data;

  // Al afgeronde sessie (behalve wanneer we net zelf ondertekend hebben).
  if (session.status !== 'ACTIVE' && step !== 'done') {
    return (
      <HerstelShell subtitle="Afronden" wide>
        <Card>
          <div className="space-y-4 py-2 text-center">
            <p className="text-sm text-gray-700">
              Deze herstelsessie is al afgerond — de herstelverklaring is ondertekend.
            </p>
            <Button
              variant="secondary"
              onClick={() =>
                downloadRepairDeclarationPdf().catch((err) =>
                  showToast(getErrorMessage(err, 'Download mislukt'), 'error'),
                )
              }
            >
              Herstelverklaring downloaden (PDF)
            </Button>
            <Link to="/herstel/overzicht" className="block text-sm font-medium text-primary-600 hover:underline">
              ← Terug naar het overzicht
            </Link>
          </div>
        </Card>
      </HerstelShell>
    );
  }

  // Afgeleide waarden met defaults (pas gezet zodra de gebruiker iets wijzigt).
  const selectable = new Set(
    myReported.filter((f) => (f.repair?.photos.length ?? 0) >= 1).map((f) => f.repair!.resolutionId),
  );
  const selectedIds = selected ?? selectable; // default: alle geldige meldingen aangevinkt
  const nameValue = contactName ?? session.contactName ?? '';
  const companyValue = companyName ?? session.companyName ?? '';
  const emailValue = email ?? session.email ?? '';
  const emailRequired = session.accessType === 'ANONYMOUS';

  const toggleSelected = (resolutionId: string) => {
    const next = new Set(selectedIds);
    if (next.has(resolutionId)) next.delete(resolutionId);
    else next.add(resolutionId);
    setSelected(next);
  };

  const validateGegevens = (): boolean => {
    const errs: { contactName?: string; email?: string } = {};
    if (!nameValue.trim()) errs.contactName = 'Naam is verplicht';
    if (emailRequired && !emailValue.trim()) {
      errs.email = 'E-mailadres is verplicht — daar sturen we de bevestiging naartoe';
    } else if (emailValue.trim() && !EMAIL_RE.test(emailValue.trim())) {
      errs.email = 'Voer een geldig e-mailadres in';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleToPreview = async () => {
    setError(null);
    if (!validateGegevens()) return;
    try {
      const result = await complete.mutateAsync({
        resolutionIds: [...selectedIds],
        contactName: nameValue.trim(),
        companyName: companyValue.trim() || undefined,
        email: emailValue.trim() || undefined,
      });
      setPreview(result);
      setStep(3);
    } catch (err) {
      setError(getErrorMessage(err, 'Kon de herstelverklaring niet genereren'));
    }
  };

  const handleSign = async () => {
    if (!signatureImage) return;
    setError(null);
    try {
      await sign.mutateAsync(signatureImage);
      setStep('done');
    } catch (err) {
      setError(getErrorMessage(err, 'Ondertekenen mislukt'));
    }
  };

  return (
    <HerstelShell subtitle="Herstelverklaring afronden" wide>
      <div className="space-y-4">
        {step !== 'done' && (
          <Link
            to="/herstel/overzicht"
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            ← Terug naar het overzicht
          </Link>
        )}

        <Card>
          <StepIndicator step={step} />

          {/* Stap 1 — Selectie */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Selecteer de herstelmeldingen waarvoor u de herstelverklaring ondertekent.
              </p>

              {myReported.length === 0 ? (
                <div className="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500">
                  U heeft nog geen herstelmeldingen gedaan. Meld eerst herstel via het overzicht.
                </div>
              ) : (
                <div className="space-y-2">
                  {myReported.map((finding) => {
                    const resolutionId = finding.repair!.resolutionId;
                    const photoCount = finding.repair!.photos.length;
                    const hasPhoto = photoCount >= 1;
                    return (
                      <div
                        key={finding.id}
                        className={clsx(
                          'rounded-lg border p-3',
                          hasPhoto ? 'border-gray-200' : 'border-warning-500/40 bg-warning-50/50',
                        )}
                      >
                        <Checkbox
                          label={`#${finding.seq} ${finding.shortDescription}`}
                          checked={selectedIds.has(resolutionId)}
                          disabled={!hasPhoto}
                          onChange={() => toggleSelected(resolutionId)}
                        />
                        {!hasPhoto && (
                          <p className="mt-1 pl-6 text-xs text-warning-600">
                            Nog geen bewijsfoto — voeg eerst minimaal één foto toe via het overzicht.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {myConflicts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Niet selecteerbaar
                  </p>
                  {myConflicts.map((finding) => (
                    <div key={finding.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 opacity-70">
                      <Checkbox
                        label={`#${finding.seq} ${finding.shortDescription}`}
                        checked={false}
                        disabled
                        onChange={() => undefined}
                      />
                      <p className="mt-1 pl-6 text-xs text-gray-500">
                        Een andere partij was u voor — deze melding is als conflict bewaard en telt niet mee
                        in uw verklaring.
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <Button size="lg" disabled={selectedIds.size === 0} onClick={() => setStep(2)}>
                  Volgende
                </Button>
              </div>
            </div>
          )}

          {/* Stap 2 — Gegevens */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Deze gegevens komen op de herstelverklaring te staan.
              </p>

              <Input
                label="Naam"
                placeholder="Uw volledige naam"
                autoComplete="name"
                value={nameValue}
                error={fieldErrors.contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
              <Input
                label="Bedrijf (optioneel)"
                placeholder="Bedrijfsnaam"
                autoComplete="organization"
                value={companyValue}
                onChange={(e) => setCompanyName(e.target.value)}
              />
              <Input
                label={emailRequired ? 'E-mailadres' : 'E-mailadres (optioneel)'}
                type="email"
                placeholder="naam@bedrijf.nl"
                autoComplete="email"
                value={emailValue}
                error={fieldErrors.email}
                helperText={emailRequired ? 'Hier ontvangt u de bevestiging met de verklaring.' : undefined}
                onChange={(e) => setEmail(e.target.value)}
              />

              <ErrorBox>{error}</ErrorBox>

              <div className="flex justify-between gap-3">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  Terug
                </Button>
                <Button size="lg" onClick={handleToPreview} isLoading={complete.isPending}>
                  Naar controle
                </Button>
              </div>
            </div>
          )}

          {/* Stap 3 — Controle (preview) */}
          {step === 3 && preview && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Controleer de herstelverklaring. Klopt alles? Ga dan door naar ondertekenen.
              </p>
              <iframe
                title="Voorbeeld herstelverklaring"
                srcDoc={preview.htmlPreview}
                sandbox=""
                className="h-[60vh] w-full rounded-lg border border-gray-200 bg-white"
              />
              <div className="flex justify-between gap-3">
                <Button variant="secondary" onClick={() => setStep(2)}>
                  Terug
                </Button>
                <Button size="lg" onClick={() => setStep(4)}>
                  Naar ondertekenen
                </Button>
              </div>
            </div>
          )}

          {/* Stap 4 — Ondertekenen */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Handtekening</label>
                <SignatureCanvas onSave={(dataUrl) => setSignatureImage(dataUrl)} />
                {signatureImage && (
                  <p className="mt-1 text-xs font-medium text-success-600">✓ Handtekening vastgelegd</p>
                )}
              </div>

              <Checkbox
                label="Ik verklaar dat de geselecteerde constateringen zijn hersteld zoals omschreven."
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />

              <ErrorBox>{error}</ErrorBox>

              <div className="flex justify-between gap-3">
                <Button variant="secondary" onClick={() => setStep(3)}>
                  Terug
                </Button>
                <Button
                  size="lg"
                  disabled={!signatureImage || !agreed}
                  isLoading={sign.isPending}
                  onClick={handleSign}
                >
                  Ondertekenen
                </Button>
              </div>
            </div>
          )}

          {/* Bevestiging */}
          {step === 'done' && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-50">
                <svg className="h-6 w-6 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Herstelverklaring ondertekend</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Bedankt! U ontvangt de ondertekende verklaring per e-mail
                  {emailValue.trim() ? ` op ${emailValue.trim()}` : ''}.
                </p>
              </div>
              <Button
                size="lg"
                className="w-full"
                onClick={() =>
                  downloadRepairDeclarationPdf().catch((err) =>
                    showToast(getErrorMessage(err, 'Download mislukt'), 'error'),
                  )
                }
              >
                Herstelverklaring downloaden (PDF)
              </Button>
              <Link
                to="/herstel/overzicht"
                className="block text-sm font-medium text-primary-600 hover:underline"
              >
                Terug naar het overzicht
              </Link>
            </div>
          )}
        </Card>
      </div>
    </HerstelShell>
  );
}

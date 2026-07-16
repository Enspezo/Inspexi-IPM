import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { formatFileSize, formatWeekdayDate as formatDate, formatTime } from '@/lib/format';
import { getStatusConfig, PLANNING_STATUS, SESSION_STATUS } from '@/lib/status';
import type { PlanningItem, CrmDocument, PlanningSession, UserSummary } from '@/types';
import { PlanningStatus, AcceptanceStatus, SessionStatus } from '@/types';

const API_BASE = '/api/v1';

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} uur ${m} min`;
  if (h > 0) return `${h} uur`;
  return `${m} min`;
}

function getContactName(contact?: { companyName?: string | null; firstName?: string | null; lastName?: string | null } | null): string {
  if (!contact) return '';
  if (contact.companyName) return contact.companyName;
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '';
}

/**
 * Toont de server-resolved client-veilige contactgegevens van een inspecteur
 * (telefoon als tel:-link, e-mail als mailto:-link). `phone`/`email` komen van
 * het publieke planning-endpoint en zijn al per kanaal afgehandeld door de
 * backend — toon niets wanneer beide ontbreken.
 */
function InspectorContactLinks({ user }: { user?: UserSummary | null }) {
  const phone = user?.phone?.trim();
  const email = user?.email?.trim();
  if (!phone && !email) return null;

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
      {phone && (
        <a href={`tel:${phone}`} className="text-primary-600 hover:underline">
          {phone}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className="text-primary-600 hover:underline">
          {email}
        </a>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: PlanningStatus }) {
  // Canonieke bron (lib/status.ts) — geen lokale status-map dupliceren (FE-2).
  const { label, classes } = getStatusConfig(PLANNING_STATUS, status);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}

function SessionPublicCard({
  session,
  totalSessions,
  primaryColor,
}: {
  session: PlanningSession;
  totalSessions: number;
  primaryColor: string;
}) {
  const { label, classes: className } = getStatusConfig(SESSION_STATUS, session.status);
  const acceptedInspectors =
    session.sessionInspectors?.filter((si) => si.acceptanceStatus === AcceptanceStatus.ACCEPTED) ?? [];

  return (
    <div className="px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            Sessie {session.sessionNumber} van {totalSessions}
          </p>
          {session.scheduledDate ? (
            <p className="mt-0.5 text-sm text-gray-600">
              {formatDate(session.scheduledDate)} · {formatTime(session.scheduledDate)}
              {session.durationHours ? ` · ${formatDuration(session.durationHours * 60)}` : ''}
            </p>
          ) : (
            <p className="mt-0.5 text-sm italic text-gray-400">Datum nog niet gepland</p>
          )}
          {session.notes && (
            <p className="mt-1 text-xs text-gray-500">{session.notes}</p>
          )}
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
        >
          {label}
        </span>
      </div>

      {acceptedInspectors.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {acceptedInspectors.map((si) => (
            <div key={si.id} className="flex items-center gap-1.5">
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: si.user?.color || primaryColor }}
              >
                {si.user?.initials || si.user?.firstName?.[0] || '?'}
              </div>
              <div className="min-w-0">
                <span className="text-xs text-gray-600">
                  {si.user?.firstName} {si.user?.lastName}
                  {si.isPrimary && <span className="ml-1 text-gray-400">(Hoofd)</span>}
                </span>
                <InspectorContactLinks user={si.user} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type PublicPlanningData = PlanningItem & {
  documents?: CrmDocument[];
};

export default function PlanningPublicPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicPlanningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reschedule state
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [clientName, setClientName] = useState('');
  const [rescheduleSending, setRescheduleSending] = useState(false);
  const [rescheduleSent, setRescheduleSent] = useState(false);

  // Q&A state
  const [question, setQuestion] = useState('');
  const [questionSending, setQuestionSending] = useState(false);
  const [questionSent, setQuestionSent] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/public/planning/${token}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.message || 'Afspraak niet gevonden');
        }
      })
      .catch(() => setError('Afspraak kon niet geladen worden'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleDownloadIcs = async () => {
    const r = await fetch(`${API_BASE}/public/planning/${token}/ics`);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'afspraak.ics';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDocument = async (doc: CrmDocument) => {
    const r = await fetch(`${API_BASE}/public/planning/${token}/documents/${doc.id}/download`);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendReschedule = async () => {
    if (!rescheduleReason.trim()) return;
    setRescheduleSending(true);
    try {
      const r = await fetch(`${API_BASE}/public/planning/${token}/reschedule-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: rescheduleReason,
          preferredDate: preferredDate || undefined,
          clientName: clientName || undefined,
        }),
      });
      if (r.ok) {
        setRescheduleSent(true);
        setShowRescheduleForm(false);
      }
    } finally {
      setRescheduleSending(false);
    }
  };

  const handleSendQuestion = async () => {
    if (!question.trim()) return;
    setQuestionSending(true);
    try {
      const r = await fetch(`${API_BASE}/public/planning/${token}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question }),
      });
      if (r.ok) {
        setQuestionSent(true);
        setQuestion('');
      }
    } finally {
      setQuestionSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mb-4 text-5xl">📅</div>
          <h1 className="mb-2 text-xl font-bold text-gray-900">Afspraak niet gevonden</h1>
          <p className="text-gray-500">{error || 'De link is mogelijk verlopen of ongeldig.'}</p>
        </div>
      </div>
    );
  }

  const org = data.organization;
  const primaryColor = org?.primaryColor || '#1E40AF';
  const acceptedInspectors = data.inspectors?.filter((i) => i.acceptanceStatus === AcceptanceStatus.ACCEPTED) ?? [];
  const sharedDocuments = (data.documents ?? []).filter((d) => d.isSharedWithClient);
  const activeSessions = (data.sessions ?? []).filter((s) => !s.isCancelled);
  const definitiefSessionCount = activeSessions.filter(
    (s) => s.status === SessionStatus.DEFINITIEF || s.status === SessionStatus.AFGEROND,
  ).length;
  // For multi-day items the parent scheduledDate is null — use the first session date instead
  const displayDate = data.isMultiDay
    ? activeSessions.find((s) => s.scheduledDate)?.scheduledDate ?? null
    : data.scheduledDate;

  // Can reschedule: only if GEPLAND and not already rescheduled
  const canReschedule = data.status === PlanningStatus.GEPLAND || data.status === PlanningStatus.CONCEPT;

  const location = data.location;
  const locationStr = location
    ? [location.street, location.houseNumber, location.postalCode, location.city].filter(Boolean).join(' ')
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          {org?.logoUrl ? (
            <img src={org.logoUrl} alt={org.name} className="h-10 object-contain" />
          ) : (
            <span className="text-lg font-bold text-gray-900" style={{ color: primaryColor }}>
              {org?.name || 'InspeXi'}
            </span>
          )}
          <StatusBadge status={data.status} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {data.isMultiDay ? 'Uw afspraken' : 'Uw afspraak'}
          </h1>
          <p className="mt-1 text-gray-500">
            {data.productName || 'Inspectie'}
            {data.contact ? ` · ${getContactName(data.contact)}` : ''}
          </p>
        </div>

        {/* Labels */}
        {data.labels && data.labels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.labels.map((label) => (
              <span key={label} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Appointment details */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4" style={{ backgroundColor: `${primaryColor}10` }}>
            <h2 className="text-base font-semibold text-gray-900">Afspraakdetails</h2>
          </div>
          <div className="divide-y divide-gray-100 px-6">
            <dl className="divide-y divide-gray-100">
              <div className="flex items-start gap-4 py-3">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    {data.isMultiDay ? 'Startdatum' : 'Datum'}
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium text-gray-900">
                    {formatDate(displayDate)}
                    {data.isMultiDay && activeSessions.length > 0 && (
                      <span className="ml-2 text-xs text-gray-400">({activeSessions.length} sessies)</span>
                    )}
                  </dd>
                </div>
              </div>

              {displayDate && !data.isMultiDay && (
                <div className="flex items-start gap-4 py-3">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Tijdstip</dt>
                    <dd className="mt-0.5 text-sm font-medium text-gray-900">
                      {formatTime(displayDate)}
                      {data.durationHours ? ` (${formatDuration(data.durationHours * 60)})` : ''}
                    </dd>
                  </div>
                </div>
              )}

              {locationStr && (
                <div className="flex items-start gap-4 py-3">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Locatie</dt>
                    <dd className="mt-0.5 text-sm font-medium text-gray-900">{locationStr}</dd>
                    {location?.name && <dd className="text-xs text-gray-500">{location.name}</dd>}
                  </div>
                </div>
              )}

              {data.productName && (
                <div className="flex items-start gap-4 py-3">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Soort inspectie</dt>
                    <dd className="mt-0.5 text-sm font-medium text-gray-900">{data.productName}</dd>
                  </div>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Sessions — only shown for multi-day items */}
        {data.isMultiDay && activeSessions.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4" style={{ backgroundColor: `${primaryColor}10` }}>
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                Sessies
                <span className="text-sm font-normal text-gray-500">
                  ({definitiefSessionCount} van {activeSessions.length} definitief)
                </span>
              </h2>
            </div>
            <div className="divide-y divide-gray-100">
              {activeSessions.map((session) => (
                <SessionPublicCard
                  key={session.id}
                  session={session}
                  totalSessions={activeSessions.length}
                  primaryColor={primaryColor}
                />
              ))}
            </div>
          </div>
        )}

        {/* Inspectors */}
        {acceptedInspectors.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">Uw inspecteur{acceptedInspectors.length > 1 ? 's' : ''}</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {acceptedInspectors.map((inspector) => (
                <div key={inspector.id} className="flex items-center gap-4 px-6 py-4">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: inspector.user?.color || primaryColor }}
                  >
                    {inspector.user?.initials || (inspector.user?.firstName?.[0] ?? '?')}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {inspector.user?.firstName} {inspector.user?.lastName}
                      {inspector.isPrimary && (
                        <span className="ml-2 text-xs text-gray-400">(Hoofdinspecteur)</span>
                      )}
                    </p>
                    <InspectorContactLinks user={inspector.user} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {(data.status === PlanningStatus.GEPLAND || data.status === PlanningStatus.CONCEPT) && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDownloadIcs}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Toevoegen aan agenda (.ics)
            </button>

            {canReschedule && !rescheduleSent && (
              <button
                onClick={() => setShowRescheduleForm(!showRescheduleForm)}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 shadow-sm hover:bg-amber-100"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Afspraak verzetten
              </button>
            )}
          </div>
        )}

        {/* Reschedule sent confirmation */}
        {rescheduleSent && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-700">
              ✓ Uw verzoek om de afspraak te verzetten is ontvangen. U wordt zo snel mogelijk gecontacteerd.
            </p>
          </div>
        )}

        {/* Reschedule form */}
        {showRescheduleForm && !rescheduleSent && (
          <div className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
            <div className="border-b border-amber-200 bg-amber-50 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">Afspraak verzetten</h2>
              <p className="mt-0.5 text-sm text-gray-500">Geef aan waarom u de afspraak wilt verzetten en uw voorkeursdatum.</p>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Uw naam
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Uw naam"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Reden <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="Geef een reden op voor het verzetten van de afspraak..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Voorkeursdatum (optioneel)
                </label>
                <input
                  type="date"
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSendReschedule}
                  disabled={!rescheduleReason.trim() || rescheduleSending}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ backgroundColor: primaryColor }}
                >
                  {rescheduleSending ? 'Versturen...' : 'Verzoek indienen'}
                </button>
                <button
                  onClick={() => setShowRescheduleForm(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Annuleren
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {data.internalNotes && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Opmerkingen</h2>
            <p className="whitespace-pre-wrap text-sm text-gray-700">{data.internalNotes}</p>
          </div>
        )}

        {/* Shared documents */}
        {sharedDocuments.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">Bijlagen</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {sharedDocuments.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between px-6 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{doc.fileName}</p>
                      <p className="text-xs text-gray-400">{formatFileSize(doc.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownloadDocument(doc)}
                    className="ml-4 shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Q&A */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">Vragen stellen</h2>
          </div>
          <div className="p-6">
            {questionSent ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
                <p className="text-sm font-medium text-green-700">
                  ✓ Uw vraag is verstuurd. U ontvangt een e-mail zodra er een antwoord is.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  Heeft u vragen over uw afspraak? Stel ze hier en wij nemen zo spoedig mogelijk contact op.
                </p>
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Uw vraag..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
                <button
                  onClick={handleSendQuestion}
                  disabled={!question.trim() || questionSending}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ backgroundColor: primaryColor }}
                >
                  {questionSending ? 'Versturen...' : 'Vraag versturen'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pb-8 text-center text-xs text-gray-400">
          <p>Aangeboden door {org?.name || 'InspeXi'} via InspeXi Beheer</p>
        </div>
      </main>
    </div>
  );
}

// Herstelmeldingen (PRD-14) bij een constatering op de staf-assets-tab:
//  - REPORTED  → blok "Online herstel" met werkzaamheden, foto's, datum en
//                invullergegevens (alleen staf mag dit zien);
//  - CONFLICT  → uitklapbaar blok "Conflict — niet doorgevoerd" met de bewaarde
//                omschrijving + foto's (first-wins: dit herstel is niet doorgevoerd).
// Foto's via authenticated fetch → object-URL (zelfde patroon als floor-plan-tab).
import { useEffect, useState } from 'react';
import { getAccessToken } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { RepairAccessType, ResolutionStatusCode } from '@/types';
import type {
  Finding,
  FindingResolution,
  FindingResolutionPhoto,
  RepairSessionContact,
} from '@/types';

/** Invuller-weergave: naam/bedrijf, of 'Ingelogde klant' bij CLIENT_USER zonder naam. */
export function repairContactLabel(session: RepairSessionContact | null): string {
  if (!session) return 'Onbekend';
  const name = [session.contactName, session.companyName].filter(Boolean).join(' — ');
  if (name) return name;
  return session.accessType === RepairAccessType.CLIENT_USER ? 'Ingelogde klant' : 'Onbekend';
}

export function FindingRepairInfo({ finding }: { finding: Finding }) {
  const resolutions = finding.resolutions ?? [];
  const reported = resolutions.filter((r) => r.statusCode === ResolutionStatusCode.REPORTED);
  const conflicts = resolutions.filter((r) => r.statusCode === ResolutionStatusCode.CONFLICT);
  if (reported.length === 0 && conflicts.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {reported.map((r) => (
        <ReportedResolutionBlock key={r.id} resolution={r} />
      ))}
      {conflicts.map((r) => (
        <ConflictResolutionBlock key={r.id} resolution={r} />
      ))}
    </div>
  );
}

// ── REPORTED: hersteld gemeld via online herstel ──
function ReportedResolutionBlock({ resolution }: { resolution: FindingResolution }) {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-green-800">Online herstel</span>
        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
          Hersteld gemeld
        </span>
        <span className="text-xs text-gray-500">{formatDateTime(resolution.resolvedAt)}</span>
      </div>
      <ResolutionBody resolution={resolution} />
    </div>
  );
}

// ── CONFLICT: uitklapbaar, niet doorgevoerd (first-wins) ──
function ConflictResolutionBlock({ resolution }: { resolution: FindingResolution }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <svg
            className={`h-4 w-4 shrink-0 text-orange-400 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-orange-800">Conflict — niet doorgevoerd</span>
        </span>
        <span className="text-xs text-gray-500">{formatDateTime(resolution.resolvedAt)}</span>
      </button>
      {open && (
        <div className="border-t border-orange-200 px-3 py-2">
          <p className="text-xs text-gray-500">
            Deze herstelmelding is niet doorgevoerd omdat de constatering al eerder hersteld
            was gemeld. De ingevulde gegevens zijn ter referentie bewaard.
          </p>
          <ResolutionBody resolution={resolution} />
        </div>
      )}
    </div>
  );
}

// ── Gedeelde body: werkzaamheden, foto's en invullergegevens ──
function ResolutionBody({ resolution }: { resolution: FindingResolution }) {
  const session = resolution.repairSession;

  return (
    <div className="mt-1.5 space-y-2">
      <div>
        <p className="text-xs font-medium text-gray-500">Uitgevoerde werkzaamheden</p>
        <p className="text-sm text-gray-900">{resolution.description || '—'}</p>
      </div>

      {resolution.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {resolution.photos.map((photo) => (
            <ResolutionPhotoThumb key={photo.id} photo={photo} />
          ))}
        </div>
      )}

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <div>
          <dt className="font-medium text-gray-500">Bron</dt>
          <dd className="text-gray-900">Online herstel</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Invuller</dt>
          <dd className="text-gray-900">{repairContactLabel(session)}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">E-mail</dt>
          <dd className="text-gray-900">{session?.email || '—'}</dd>
        </div>
      </dl>
    </div>
  );
}

// ── Eén foto: geauthenticeerde blob-fetch → object-URL ──
function ResolutionPhotoThumb({ photo }: { photo: FindingResolutionPhoto }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const token = getAccessToken();
    fetch(photo.url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) throw new Error('photo fetch failed');
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.url]);

  if (failed) {
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-md bg-gray-100 text-xs text-gray-400">
        Foto niet beschikbaar
      </div>
    );
  }
  if (!src) {
    return <div className="h-20 w-20 animate-pulse rounded-md bg-gray-100" />;
  }
  return (
    <img
      src={src}
      alt={photo.caption ?? 'Herstelfoto'}
      className="h-20 w-20 rounded-md object-cover ring-1 ring-gray-200"
    />
  );
}

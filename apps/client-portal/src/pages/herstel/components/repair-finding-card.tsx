import { useState } from 'react';
import { clsx } from 'clsx';
import { Button, ImageLightbox } from '@/components/ui';
import type { LightboxImage } from '@/components/ui/image-lightbox';
import { formatDate } from '@/lib/format';
import { useRepairBlobUrls } from '../hooks/use-repair';
import type { RepairFindingView, RepairPhotoRef } from '@/types';

/** Foto-strip achter het sessie-token: blobs ophalen, thumbnails + lightbox. */
function PhotoStrip({ photos }: { photos: RepairPhotoRef[] }) {
  const blobUrls = useRepairBlobUrls(photos.map((p) => p.url));
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  const lightboxImages: LightboxImage[] = blobUrls
    .filter((u): u is string => !!u)
    .map((url) => ({ url }));

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {photos.map((photo, idx) => {
          const url = blobUrls[idx];
          return url ? (
            <img
              key={photo.id}
              src={url}
              alt="Foto"
              onClick={() => {
                const target = lightboxImages.findIndex((li) => li.url === url);
                setLightboxIndex(target < 0 ? 0 : target);
              }}
              className="h-20 w-20 cursor-pointer rounded-lg object-cover"
            />
          ) : (
            <div key={photo.id} className="h-20 w-20 animate-pulse rounded-lg bg-gray-100" />
          );
        })}
      </div>
      {lightboxIndex !== null && lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </>
  );
}

/** Classificatie-pill met de kleur van de ClassificationOption. */
function ClassificationChip({
  classification,
}: {
  classification: RepairFindingView['classification'];
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: classification.color }}
        aria-hidden
      />
      {classification.name}
    </span>
  );
}

interface RepairFindingCardProps {
  finding: RepairFindingView;
  /** Alleen bij een ACTIEVE sessie mag herstel gemeld worden. */
  sessionActive: boolean;
  onReport: (finding: RepairFindingView) => void;
}

/**
 * Constatering-kaart in het herstel-overzicht (PRD §14.9.2):
 * open → foto's + knop "Herstel melden"; hersteld → grijs/gedimd met de
 * werkzaamheden-omschrijving en foto's, zonder herstellergegevens (besluit 4),
 * met badge "Door u gemeld" bij een eigen melding; eigen conflict → gele melding.
 */
export function RepairFindingCard({ finding, sessionActive, onReport }: RepairFindingCardProps) {
  const isResolved = finding.statusCode === 'resolved';
  const location = finding.locationDescription;

  return (
    <div
      data-testid={`repair-finding-${finding.seq}`}
      className={clsx(
        'rounded-xl border bg-white p-4 shadow-sm',
        isResolved ? 'border-gray-200 bg-gray-50 opacity-70' : 'border-gray-200',
        finding.isCritical && !isResolved && 'border-l-4 border-l-danger-500',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-900/80 px-1.5 text-xs font-semibold text-white">
              {finding.seq}
            </span>
            <ClassificationChip classification={finding.classification} />
            {finding.isCritical && (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-[11px] font-semibold text-danger-600">
                Kritiek
              </span>
            )}
          </div>
          {finding.normReference && (
            <p className="mt-2 text-xs font-semibold text-gray-700">{finding.normReference}</p>
          )}
          <p className="mt-1 text-sm font-medium text-gray-900">{finding.shortDescription}</p>
          {finding.longDescription && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{finding.longDescription}</p>
          )}
          {location && <p className="mt-1 text-xs text-gray-500">📍 {location}</p>}
        </div>
        <span
          className={clsx(
            'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
            isResolved ? 'bg-success-50 text-success-600' : 'bg-warning-50 text-warning-600',
          )}
        >
          {isResolved ? 'Hersteld' : 'Open'}
        </span>
      </div>

      {/* Foto's van de constatering zelf */}
      <PhotoStrip photos={finding.photos} />

      {/* Herstel-info (zonder wie — PRD besluit 4) */}
      {finding.repair && (
        <div className="mt-3 rounded-lg bg-white px-3 py-2 ring-1 ring-gray-200">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-700">
              Hersteld gemeld op {formatDate(finding.repair.reportedAt)}
            </span>
            {finding.repair.isMine && (
              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
                Door u gemeld
              </span>
            )}
          </div>
          {finding.repair.description && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
              {finding.repair.description}
            </p>
          )}
          <PhotoStrip photos={finding.repair.photos} />
        </div>
      )}

      {/* Eigen conflict-concept: verloren race, invoer bewaard */}
      {finding.myConflict && (
        <div className="mt-3 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-600" role="status">
          Een andere partij was u voor — uw invoer is bewaard en de projectmanager is geïnformeerd.
        </div>
      )}

      {!isResolved && sessionActive && (
        <Button size="lg" className="mt-4 w-full" onClick={() => onReport(finding)}>
          Herstel melden
        </Button>
      )}
    </div>
  );
}

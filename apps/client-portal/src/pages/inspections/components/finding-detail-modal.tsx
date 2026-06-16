import { useState, useEffect } from 'react';
import {
  Modal,
  Spinner,
  Button,
  LookupBadge,
  ErrorBox,
  ImageLightbox,
  useConfirm,
  useToast,
} from '@/components/ui';
import type { LightboxImage } from '@/components/ui/image-lightbox';
import { useFinding, useDeleteResolution } from '../hooks/use-findings';
import { ResolveFindingModal } from './resolve-finding-modal';
import { getAccessToken, getErrorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { personName } from '@/lib/labels';
import type { FindingResolutionDetail } from '@/types';

const PENDING = 'PENDING_VERIFICATION';

/**
 * Resolutie-foto's hangen achter een geauthenticeerd endpoint (Bearer-token), dus een directe
 * <img src> werkt niet. Haal de blobs op met het token en geef tijdelijke object-URL's terug.
 */
function useAuthBlobUrls(urls: string[]): (string | null)[] {
  const key = urls.join('|');
  const [resolved, setResolved] = useState<(string | null)[]>(() => urls.map(() => null));

  useEffect(() => {
    let active = true;
    const created: string[] = [];
    const token = getAccessToken();
    Promise.all(
      urls.map((u) =>
        fetch(u, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
          .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('fetch'))))
          .then((b) => {
            const obj = URL.createObjectURL(b);
            created.push(obj);
            return obj;
          })
          .catch(() => null),
      ),
    ).then((list) => {
      if (active) setResolved(list);
    });
    return () => {
      active = false;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return resolved;
}

interface FindingDetailModalProps {
  findingId: string;
  onClose: () => void;
}

export function FindingDetailModal({ findingId, onClose }: FindingDetailModalProps) {
  const { data: finding, isLoading, error } = useFinding(findingId);
  const [showResolve, setShowResolve] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);

  const hasPending = !!finding?.resolutions.some((r) => r.statusCode === PENDING);
  const canResolve = !!finding && finding.statusCode !== 'resolved' && !hasPending;
  const recommendation = finding?.recommendationCustom || finding?.recommendation;

  return (
    <Modal isOpen title="Constatering" onClose={onClose} className="max-w-2xl">
      {isLoading && (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      )}

      {error && <ErrorBox>Kon de constatering niet laden.</ErrorBox>}

      {finding && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              {finding.normReference && (
                <p className="text-xs font-semibold text-gray-700">{finding.normReference}</p>
              )}
              <div className="mt-1 flex flex-wrap gap-1">
                {Object.entries(finding.classificationValues ?? {}).map(([key, value]) => (
                  <span key={key} className="rounded bg-orange-50 px-1.5 py-0.5 text-[11px] text-orange-700">
                    {key}: {String(value)}
                  </span>
                ))}
              </div>
            </div>
            <LookupBadge kind="finding-status-types" code={finding.statusCode} />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900">{finding.shortDescription}</h3>
            {finding.longDescription && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{finding.longDescription}</p>
            )}
          </div>

          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
            <p className="font-medium text-gray-900">{finding.asset.name}</p>
            {(finding.locationDescription || finding.asset.locationDescription) && (
              <p className="text-xs text-gray-500">
                {finding.locationDescription || finding.asset.locationDescription}
              </p>
            )}
          </div>

          {recommendation && (
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              <p className="font-medium">Aanbeveling</p>
              <p className="mt-0.5 whitespace-pre-wrap">{recommendation}</p>
            </div>
          )}

          {finding.resolutions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-900">Meldingen</h4>
              {finding.resolutions.map((resolution) => (
                <ResolutionCard
                  key={resolution.id}
                  resolution={resolution}
                  findingId={finding.id}
                  onOpenLightbox={(images, index) => setLightbox({ images, index })}
                />
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
            <Button variant="secondary" onClick={onClose}>
              Sluiten
            </Button>
            {canResolve ? (
              <Button onClick={() => setShowResolve(true)}>Als opgelost markeren</Button>
            ) : hasPending ? (
              <span className="text-sm text-gray-500">Wacht op verificatie door de inspecteur</span>
            ) : null}
          </div>
        </div>
      )}

      {showResolve && finding && (
        <ResolveFindingModal
          finding={finding}
          onClose={() => setShowResolve(false)}
          onSuccess={() => setShowResolve(false)}
        />
      )}

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          currentIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(index) => setLightbox((prev) => (prev ? { ...prev, index } : prev))}
        />
      )}
    </Modal>
  );
}

function ResolutionCard({
  resolution,
  findingId,
  onOpenLightbox,
}: {
  resolution: FindingResolutionDetail;
  findingId: string;
  onOpenLightbox: (images: LightboxImage[], index: number) => void;
}) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const del = useDeleteResolution(findingId);
  const isPending = resolution.statusCode === PENDING;
  const blobUrls = useAuthBlobUrls(resolution.photos.map((p) => p.url));

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Melding intrekken',
      message: 'Weet u zeker dat u deze melding wilt intrekken?',
      confirmLabel: 'Intrekken',
    });
    if (!ok) return;
    try {
      await del.mutateAsync();
    } catch (err) {
      showToast(getErrorMessage(err, 'Intrekken mislukt'), 'error');
    }
  };

  const lightboxImages: LightboxImage[] = resolution.photos
    .map((p, i) => ({ url: blobUrls[i], caption: p.caption }))
    .filter((p): p is { url: string; caption: string | null } => !!p.url);

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <LookupBadge kind="resolution-status-types" code={resolution.statusCode} />
        {isPending && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={del.isPending}
            className="text-xs font-medium text-danger-600 hover:underline disabled:opacity-50"
          >
            Intrekken
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Gemeld op {formatDate(resolution.resolvedAt)}
        {resolution.resolvedByClientUser ? ` door ${personName(resolution.resolvedByClientUser)}` : ''}
      </p>
      {resolution.description && <p className="mt-1 text-sm text-gray-700">{resolution.description}</p>}

      {resolution.photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {resolution.photos.map((photo, idx) => {
            const url = blobUrls[idx];
            return url ? (
              <img
                key={photo.id}
                src={url}
                alt={photo.caption ?? 'Foto'}
                onClick={() => {
                  const target = lightboxImages.findIndex((li) => li.url === url);
                  onOpenLightbox(lightboxImages, target < 0 ? 0 : target);
                }}
                className="h-16 w-16 cursor-pointer rounded object-cover"
              />
            ) : (
              <div key={photo.id} className="h-16 w-16 animate-pulse rounded bg-gray-100" />
            );
          })}
        </div>
      )}

      {resolution.verificationNotes && (
        <p className="mt-2 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">
          Toelichting inspecteur: {resolution.verificationNotes}
        </p>
      )}
    </div>
  );
}

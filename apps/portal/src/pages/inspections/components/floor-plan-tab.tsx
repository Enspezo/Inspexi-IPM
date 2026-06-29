import { useState, useEffect, useMemo, useRef } from 'react';
import { Button, Card, Select, Spinner, ErrorBox, useToast, useConfirm } from '@/components/ui';
import { LocationImageViewer, type Marker, type Annotation } from '@/components/location-image-viewer';
import { MarkerType, AssetNodeType } from '@/types';
import { getAccessToken, getErrorMessage } from '@/lib/api-client';
import { useLookups, type LookupRow } from '@/lib/lookups';
import { usePlanTree } from '../hooks/use-asset-nodes';
import { normalizeTree, flattenTree, indentLabel } from '@/components/asset-tree';
import {
  useLocationImage,
  useUploadLocationImage,
  useDeleteLocationImage,
  useCreateMarker,
  useUpdateMarker,
  useDeleteMarker,
  type CreateMarkerInput,
} from '../hooks/use-location-images';
import { AddMarkerModal } from './add-marker-modal';

const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/svg+xml';

/** Enum (API) → string-union (viewer); waarden zijn identiek. */
const VIEWER_TYPE: Record<MarkerType, Marker['markerType']> = {
  [MarkerType.ASSET]: 'ASSET',
  [MarkerType.MEASUREMENT]: 'MEASUREMENT',
  [MarkerType.FINDING]: 'FINDING',
};

function lookupOf(rows: LookupRow[] | undefined, code: string | null | undefined): LookupRow | null {
  if (!code || !rows) return null;
  return rows.find((r) => r.code === code) ?? null;
}

/**
 * Plattegrond-tab: kies een inspectie-locatie en bekijk/bewerk de plattegrond
 * met klikbare markers. Per locatie hoort één afbeelding (location-images).
 */
export function FloorPlanTab({ planId, canWrite }: { planId: string; canWrite: boolean }) {
  const { data: treeData, isLoading, error } = usePlanTree(planId);
  const [selectedLocationId, setSelectedLocationId] = useState('');

  // Alleen LOCATION-nodes uit de boom kunnen een plattegrond dragen.
  const locationNodes = useMemo(
    () => flattenTree(normalizeTree(treeData)).filter((n) => n.nodeType === AssetNodeType.LOCATION),
    [treeData],
  );

  useEffect(() => {
    if (locationNodes.length > 0 && !selectedLocationId) {
      setSelectedLocationId(locationNodes[0].id);
    }
  }, [locationNodes, selectedLocationId]);

  if (isLoading) {
    return (
      <Card title="Plattegrond">
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      </Card>
    );
  }
  if (error) return <ErrorBox>Fout bij het laden van de locaties.</ErrorBox>;
  if (locationNodes.length === 0) {
    return (
      <Card title="Plattegrond">
        <p className="text-sm text-gray-500">
          Dit inspectieplan heeft nog geen locaties. Voeg eerst een locatie toe om een plattegrond te koppelen.
        </p>
      </Card>
    );
  }

  const locationOptions = locationNodes.map((l) => ({
    value: l.id,
    label: indentLabel(l),
  }));

  return (
    <div className="space-y-4">
      <Card title="Locatie">
        <div className="max-w-sm">
          <Select
            label="Plattegrond van locatie"
            options={locationOptions}
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
          />
        </div>
      </Card>

      {selectedLocationId && (
        <LocationFloorPlan
          key={selectedLocationId}
          locationId={selectedLocationId}
          planId={planId}
          canWrite={canWrite}
        />
      )}
    </div>
  );
}

function LocationFloorPlan({
  locationId,
  planId,
  canWrite,
}: {
  locationId: string;
  planId: string;
  canWrite: boolean;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: image, isLoading, error } = useLocationImage(locationId);
  const uploadImage = useUploadLocationImage(locationId);
  const deleteImage = useDeleteLocationImage(locationId);
  const createMarker = useCreateMarker(locationId);
  const updateMarker = useUpdateMarker(locationId);
  const deleteMarker = useDeleteMarker(locationId);

  const { data: assetStatuses } = useLookups('asset-status-types');
  const { data: findingStatuses } = useLookups('finding-status-types');

  const [isEditing, setIsEditing] = useState(false);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | undefined>(undefined);
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Geauthenticeerde blob-fetch van de afbeeldingbytes → object-URL.
  useEffect(() => {
    if (!image) {
      setImageUrl(null);
      setImageLoadFailed(false);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setImageLoadFailed(false);
    const token = getAccessToken();
    fetch(`/api/v1/locations/${locationId}/image/file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) throw new Error('image fetch failed');
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setImageUrl(null);
          setImageLoadFailed(true);
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image?.id, image?.updatedAt, locationId]);

  // API-markers → viewer-markers, met lookup-gedreven kleur/label/status.
  const markers: Marker[] = useMemo(() => {
    if (!image?.markers) return [];
    return image.markers.map((m) => {
      let label = m.label ?? undefined;
      let linkedEntity: Marker['linkedEntity'];

      if (m.markerType === MarkerType.ASSET && m.assetNode) {
        const row = lookupOf(assetStatuses, m.assetNode.statusCode);
        linkedEntity = {
          id: m.assetNode.id,
          name: m.assetNode.name,
          type: m.assetNode.typeCode,
          status: row?.label,
          classificationColor: row?.color ?? undefined,
        };
        if (!label) label = m.assetNode.name;
      } else if (m.markerType === MarkerType.FINDING && m.finding) {
        const row = lookupOf(findingStatuses, m.finding.statusCode);
        linkedEntity = {
          id: m.finding.id,
          name: m.finding.shortDescription,
          status: row?.label,
          classificationColor: row?.color ?? undefined,
        };
        if (!label) label = m.finding.shortDescription;
      } else if (m.markerType === MarkerType.MEASUREMENT && m.standaloneMeasurement) {
        linkedEntity = {
          id: m.standaloneMeasurement.id,
          name: m.standaloneMeasurement.description ?? m.standaloneMeasurement.measurementType,
          type: m.standaloneMeasurement.measurementType,
        };
        if (!label) label = m.standaloneMeasurement.measurementType;
      }

      return {
        id: m.id,
        markerType: VIEWER_TYPE[m.markerType],
        positionX: m.positionX,
        positionY: m.positionY,
        label,
        color: m.color ?? undefined,
        icon: m.icon ?? undefined,
        annotation: m.annotation ? (m.annotation as unknown as Annotation) : undefined,
        linkedEntity,
      };
    });
  }, [image?.markers, assetStatuses, findingStatuses]);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Alleen afbeeldingen zijn toegestaan', 'error');
      return;
    }
    try {
      await uploadImage.mutateAsync(file);
      showToast(image ? 'Afbeelding vervangen' : 'Afbeelding geüpload', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Uploaden mislukt'), 'error');
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // sta hetzelfde bestand opnieuw kiezen toe
    if (file) void handleFile(file);
  };

  const handleDeleteImage = async () => {
    const confirmed = await confirm({
      title: 'Plattegrond verwijderen',
      message: 'De afbeelding en alle bijbehorende markers worden verwijderd. Doorgaan?',
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteImage.mutateAsync();
      setIsEditing(false);
      setSelectedMarkerId(undefined);
      showToast('Plattegrond verwijderd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  const handleMarkerAdd = (position: { x: number; y: number }) => {
    setSelectedMarkerId(undefined);
    setPendingPosition(position);
  };

  const handleCreateMarker = async (data: CreateMarkerInput) => {
    if (!image) return;
    try {
      await createMarker.mutateAsync({ imageId: image.id, data });
      showToast('Marker toegevoegd', 'success');
      setPendingPosition(null);
    } catch (err) {
      showToast(getErrorMessage(err, 'Marker toevoegen mislukt'), 'error');
    }
  };

  const handleMarkerMove = (markerId: string, position: { x: number; y: number }) => {
    if (!image) return;
    updateMarker.mutate(
      { imageId: image.id, markerId, data: { positionX: position.x, positionY: position.y } },
      { onError: (err) => showToast(getErrorMessage(err, 'Verplaatsen mislukt'), 'error') },
    );
  };

  const handleMarkerDelete = async (markerId: string) => {
    if (!image) return;
    const confirmed = await confirm({
      title: 'Marker verwijderen',
      message: 'Weet je zeker dat je deze marker wilt verwijderen?',
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteMarker.mutateAsync({ imageId: image.id, markerId });
      if (selectedMarkerId === markerId) setSelectedMarkerId(undefined);
      showToast('Marker verwijderd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  const handleMarkerClick = (marker: Marker) => {
    setSelectedMarkerId((cur) => (cur === marker.id ? undefined : marker.id));
  };

  if (isLoading) {
    return (
      <Card title="Plattegrond">
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      </Card>
    );
  }
  if (error) return <ErrorBox>Fout bij het laden van de plattegrond.</ErrorBox>;

  // Nog geen afbeelding voor deze locatie.
  if (!image) {
    return (
      <Card title="Plattegrond">
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-300 py-12 text-center">
          <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25z"
            />
          </svg>
          <p className="text-sm text-gray-500">Nog geen plattegrond voor deze locatie.</p>
          {canWrite && (
            <Button onClick={() => fileInputRef.current?.click()} isLoading={uploadImage.isPending}>
              Afbeelding uploaden
            </Button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          className="hidden"
          onChange={onFileChange}
        />
      </Card>
    );
  }

  const mode = canWrite && isEditing ? 'edit' : 'view';

  return (
    <Card
      title="Plattegrond"
      actions={
        canWrite ? (
          <div className="flex items-center gap-2">
            <Button
              variant={isEditing ? 'primary' : 'secondary'}
              onClick={() => {
                setIsEditing((v) => !v);
                setSelectedMarkerId(undefined);
              }}
            >
              {isEditing ? 'Klaar met bewerken' : 'Markers bewerken'}
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} isLoading={uploadImage.isPending}>
              Vervangen
            </Button>
            <Button variant="danger" onClick={handleDeleteImage} isLoading={deleteImage.isPending}>
              Verwijderen
            </Button>
          </div>
        ) : undefined
      }
    >
      {imageLoadFailed ? (
        <ErrorBox>De afbeelding kon niet worden geladen.</ErrorBox>
      ) : imageUrl ? (
        <LocationImageViewer
          imageUrl={imageUrl}
          markers={markers}
          mode={mode}
          selectedMarkerId={selectedMarkerId}
          onMarkerClick={handleMarkerClick}
          onMarkerAdd={handleMarkerAdd}
          onMarkerMove={handleMarkerMove}
          onMarkerDelete={handleMarkerDelete}
        />
      ) : (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        onChange={onFileChange}
      />

      <AddMarkerModal
        isOpen={pendingPosition !== null}
        onClose={() => setPendingPosition(null)}
        planId={planId}
        position={pendingPosition}
        onCreate={handleCreateMarker}
        isSubmitting={createMarker.isPending}
      />
    </Card>
  );
}

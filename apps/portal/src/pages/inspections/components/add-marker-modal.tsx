import { useState, useEffect } from 'react';
import { Modal, Button, Select, Input, Spinner } from '@/components/ui';
import { MarkerType } from '@/types';
import {
  useInspectionAssets,
  useStandaloneMeasurements,
  useAssetFindings,
  type CreateMarkerInput,
} from '../hooks/use-location-images';

interface AddMarkerModalProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  /** Klikpositie op de afbeelding (% 0-100); null = modal dicht. */
  position: { x: number; y: number } | null;
  onCreate: (data: CreateMarkerInput) => void | Promise<void>;
  isSubmitting: boolean;
}

const TYPE_OPTIONS = [
  { value: MarkerType.ASSET, label: 'Asset' },
  { value: MarkerType.MEASUREMENT, label: 'Meting' },
  { value: MarkerType.FINDING, label: 'Constatering' },
];

export function AddMarkerModal({ isOpen, onClose, planId, position, onCreate, isSubmitting }: AddMarkerModalProps) {
  const [markerType, setMarkerType] = useState<MarkerType>(MarkerType.ASSET);
  const [assetId, setAssetId] = useState('');
  const [findingId, setFindingId] = useState('');
  const [measurementId, setMeasurementId] = useState('');
  const [label, setLabel] = useState('');

  // Reset bij (her)openen
  useEffect(() => {
    if (isOpen) {
      setMarkerType(MarkerType.ASSET);
      setAssetId('');
      setFindingId('');
      setMeasurementId('');
      setLabel('');
    }
  }, [isOpen]);

  const { data: assets, isLoading: assetsLoading } = useInspectionAssets(isOpen ? planId : undefined);
  const { data: measurements, isLoading: measurementsLoading } = useStandaloneMeasurements(
    isOpen && markerType === MarkerType.MEASUREMENT ? planId : undefined,
  );
  const { data: findings, isLoading: findingsLoading } = useAssetFindings(
    markerType === MarkerType.FINDING && assetId ? assetId : undefined,
  );

  const assetOptions = (assets ?? []).map((a) => ({
    value: a.id,
    label: a.identifier ? `${a.name} (${a.identifier})` : a.name,
  }));
  const measurementOptions = (measurements ?? []).map((m) => ({
    value: m.id,
    label: m.description ? `${m.measurementType} — ${m.description}` : m.measurementType,
  }));
  const findingOptions = (findings ?? []).map((f) => ({ value: f.id, label: f.shortDescription }));

  const canSubmit =
    !!position &&
    ((markerType === MarkerType.ASSET && !!assetId) ||
      (markerType === MarkerType.MEASUREMENT && !!measurementId) ||
      (markerType === MarkerType.FINDING && !!findingId));

  const handleSubmit = async () => {
    if (!position || !canSubmit) return;
    const data: CreateMarkerInput = {
      positionX: position.x,
      positionY: position.y,
      markerType,
      label: label.trim() || undefined,
    };
    if (markerType === MarkerType.ASSET) data.assetId = assetId;
    if (markerType === MarkerType.MEASUREMENT) data.standaloneMeasurementId = measurementId;
    if (markerType === MarkerType.FINDING) data.findingId = findingId;
    await onCreate(data);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Marker toevoegen">
      <div className="space-y-4">
        <Select
          label="Type marker"
          options={TYPE_OPTIONS}
          value={markerType}
          onChange={(e) => {
            setMarkerType(e.target.value as MarkerType);
            setAssetId('');
            setFindingId('');
            setMeasurementId('');
          }}
        />

        {/* ASSET → kies asset */}
        {markerType === MarkerType.ASSET &&
          (assetsLoading ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : assetOptions.length === 0 ? (
            <p className="text-sm text-gray-500">Geen assets in dit inspectieplan. Maak eerst een asset aan.</p>
          ) : (
            <Select
              label="Asset"
              placeholder="— Kies asset —"
              options={assetOptions}
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
            />
          ))}

        {/* MEASUREMENT → kies losse meting */}
        {markerType === MarkerType.MEASUREMENT &&
          (measurementsLoading ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : measurementOptions.length === 0 ? (
            <p className="text-sm text-gray-500">Geen losse metingen in dit inspectieplan.</p>
          ) : (
            <Select
              label="Meting"
              placeholder="— Kies meting —"
              options={measurementOptions}
              value={measurementId}
              onChange={(e) => setMeasurementId(e.target.value)}
            />
          ))}

        {/* FINDING → kies asset, dan constatering van die asset */}
        {markerType === MarkerType.FINDING && (
          <>
            {assetsLoading ? (
              <div className="flex justify-center py-4"><Spinner /></div>
            ) : assetOptions.length === 0 ? (
              <p className="text-sm text-gray-500">Geen assets met constateringen in dit inspectieplan.</p>
            ) : (
              <Select
                label="Asset"
                placeholder="— Kies asset —"
                options={assetOptions}
                value={assetId}
                onChange={(e) => {
                  setAssetId(e.target.value);
                  setFindingId('');
                }}
              />
            )}
            {assetId &&
              (findingsLoading ? (
                <div className="flex justify-center py-4"><Spinner /></div>
              ) : findingOptions.length === 0 ? (
                <p className="text-sm text-gray-500">Deze asset heeft geen constateringen.</p>
              ) : (
                <Select
                  label="Constatering"
                  placeholder="— Kies constatering —"
                  options={findingOptions}
                  value={findingId}
                  onChange={(e) => setFindingId(e.target.value)}
                />
              ))}
          </>
        )}

        <Input
          label="Label (optioneel)"
          placeholder="Korte tekst bij de marker"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} type="button">
            Annuleren
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} isLoading={isSubmitting} type="button">
            Toevoegen
          </Button>
        </div>
      </div>
    </Modal>
  );
}

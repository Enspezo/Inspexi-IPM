// Aanmaak-/bewerk-modal voor een AssetNode. Bij aanmaken kies je nodeType (locatie
// of object), het type (asset-/locatie-type-definitie), naam, kenmerk, de
// bovenliggende node en eventuele technische velden. Bij bewerken liggen nodeType
// en type vast (verplaatsen gaat via de move-modal).
import { useEffect, useMemo, useState } from 'react';
import { Modal, Button, Input, Select, ErrorBox, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { AssetNodeType, type AssetNode } from '@/types';
import { useAssetTypes, useAssetTypeFields } from '@/pages/asset-types/hooks/use-asset-types';
import { useLocationTypes, useLocationTypeFields } from '@/pages/location-types/hooks/use-location-types';
import {
  useCreateAssetNode,
  useUpdateAssetNode,
  type CreateAssetNodeInput,
} from '@/pages/inspections/hooks/use-asset-nodes';
import { ParentSelect } from './parent-select';
import { TechnicalDataForm, type TechnicalField } from './technical-data-form';
import type { TreeNode } from './tree-utils';

interface AssetNodeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Volledige boom — nodig voor de ouder-selector bij aanmaken. */
  nodes: TreeNode[];
  /** Context: óf een plan (server kiest default-parent), óf een CRM-locatieboom. */
  planId?: string;
  /** Voorgevulde bovenliggende node (bewerkbaar). */
  defaultParentId?: string | null;
  /** Voorgevuld nodeType bij aanmaken. */
  defaultNodeType?: AssetNodeType;
  /** Aanwezig = bewerken i.p.v. aanmaken. */
  node?: AssetNode | null;
  onSaved?: (node: AssetNode) => void;
}

export function AssetNodeFormModal({
  isOpen,
  onClose,
  nodes,
  planId,
  defaultParentId,
  defaultNodeType = AssetNodeType.ASSET,
  node,
  onSaved,
}: AssetNodeFormModalProps) {
  const { showToast } = useToast();
  const isEdit = !!node;

  const createMutation = useCreateAssetNode();
  const updateMutation = useUpdateAssetNode();

  const [nodeType, setNodeType] = useState<AssetNodeType>(defaultNodeType);
  const [typeId, setTypeId] = useState(''); // gekozen definitie-id (om velden te laden)
  const [typeCode, setTypeCode] = useState('');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [parentId, setParentId] = useState('');
  const [technicalData, setTechnicalData] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  // Type-definities voor de gekozen nodeType.
  const { data: assetTypes = [] } = useAssetTypes();
  const { data: locationTypes = [] } = useLocationTypes({ scope: 'INSPECTION' });
  const typeDefs = nodeType === AssetNodeType.ASSET ? assetTypes : locationTypes;

  // Velden van de gekozen type-definitie (voor het dynamische technicalData-form).
  const { data: assetFields = [] } = useAssetTypeFields(
    nodeType === AssetNodeType.ASSET ? typeId : '',
  );
  const { data: locationFields = [] } = useLocationTypeFields(
    nodeType === AssetNodeType.LOCATION ? typeId : '',
  );
  const fields = (nodeType === AssetNodeType.ASSET ? assetFields : locationFields) as TechnicalField[];

  // (Re)initialiseer bij openen.
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (node) {
      setNodeType(node.nodeType);
      setTypeCode(node.typeCode);
      setName(node.name);
      setIdentifier(node.identifier ?? '');
      setTechnicalData((node.technicalData as Record<string, unknown>) ?? {});
      setParentId(node.parentId ?? '');
    } else {
      setNodeType(defaultNodeType);
      setTypeCode('');
      setTypeId('');
      setName('');
      setIdentifier('');
      setTechnicalData({});
      setParentId(defaultParentId ?? '');
    }
  }, [isOpen, node, defaultNodeType, defaultParentId]);

  // Bij bewerken: zoek de definitie-id op uit de typeCode zodra de lijst er is.
  useEffect(() => {
    if (!isEdit || typeId) return;
    const match = typeDefs.find((t) => t.code === typeCode);
    if (match) setTypeId(match.id);
  }, [isEdit, typeId, typeDefs, typeCode]);

  const typeOptions = useMemo(
    () => typeDefs.map((t) => ({ value: t.id, label: t.name })),
    [typeDefs],
  );

  const canSubmit = name.trim() && (isEdit || typeCode) && (isEdit || planId || parentId);

  const handleTypeChange = (id: string) => {
    setTypeId(id);
    setTypeCode(typeDefs.find((t) => t.id === id)?.code ?? '');
  };

  const handleSubmit = async () => {
    setError(null);
    try {
      if (isEdit && node) {
        const saved = await updateMutation.mutateAsync({
          id: node.id,
          data: {
            name: name.trim(),
            identifier: identifier.trim() || null,
            technicalData,
          },
        });
        showToast('Node bijgewerkt', 'success');
        onSaved?.(saved);
      } else {
        const data: CreateAssetNodeInput = {
          nodeType,
          typeCode,
          name: name.trim(),
          identifier: identifier.trim() || null,
          technicalData,
          // In planboom mag parentId weg (server kiest default); anders verplicht.
          ...(parentId ? { parentId } : {}),
        };
        const saved = await createMutation.mutateAsync({ planId, data });
        showToast('Node toegevoegd', 'success');
        onSaved?.(saved);
      }
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, isEdit ? 'Bijwerken mislukt' : 'Toevoegen mislukt'));
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Node bewerken' : 'Node toevoegen'}>
      <div className="space-y-4">
        {error && <ErrorBox>{error}</ErrorBox>}

        {!isEdit && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Soort"
              options={[
                { value: AssetNodeType.ASSET, label: 'Object (asset)' },
                { value: AssetNodeType.LOCATION, label: 'Locatie' },
              ]}
              value={nodeType}
              onChange={(e) => {
                setNodeType(e.target.value as AssetNodeType);
                setTypeId('');
                setTypeCode('');
                setTechnicalData({});
              }}
            />
            <Select
              label="Type"
              placeholder="— Kies type —"
              options={typeOptions}
              value={typeId}
              onChange={(e) => handleTypeChange(e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Naam" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Kenmerk" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        </div>

        {!isEdit && (
          <ParentSelect
            label={planId ? 'Bovenliggende node (standaard = scope-locatie)' : 'Bovenliggende node'}
            nodes={nodes}
            value={parentId}
            onChange={setParentId}
          />
        )}

        {(isEdit || typeId) && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Technische gegevens
            </p>
            <TechnicalDataForm fields={fields} value={technicalData} onChange={setTechnicalData} />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} isLoading={isPending}>
            {isEdit ? 'Opslaan' : 'Toevoegen'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
